"""Concurrent-listener load test for the music streaming pipeline.

Simulates N listeners on one music channel: each logs in, fetches playback
state, mints a stream URL and downloads the current track with a realistic
browser Range pattern (probe head, then sequential chunks with pauses, plus a
couple of random seeks). Asserts zero errors and reports latency percentiles.

Run against a live stack (defaults match docker compose dev):

    ./.venv/bin/python scripts/music_load_test.py \
        --base-url http://localhost:8000/api/v1 \
        --channel-id <uuid> --listeners 25

Listeners authenticate with the seeded developer accounts
(``{username}@example.com`` / password = username) or a single account via
``--username/--password`` (default admin). All listeners join the channel
first, so run this against a disposable environment.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import statistics
import sys
import time
from dataclasses import dataclass, field

import httpx

HEAD_PROBE_BYTES = 256 * 1024
CHUNK_BYTES = 1024 * 1024
CHUNKS_PER_LISTENER = 6
PAUSE_RANGE_S = (0.2, 1.0)
RANDOM_SEEKS = 2


@dataclass
class ListenerResult:
    listener: int
    ok: bool = True
    errors: list[str] = field(default_factory=list)
    first_byte_ms: list[float] = field(default_factory=list)
    bytes_read: int = 0


async def login(client: httpx.AsyncClient, base: str, username: str, password: str) -> str:
    res = await client.post(
        f"{base}/auth/login", json={"identifier": username, "password": password}
    )
    res.raise_for_status()
    return res.json()["access_token"]


async def ranged_read(
    client: httpx.AsyncClient,
    url: str,
    start: int,
    length: int,
    result: ListenerResult,
) -> tuple[int, int]:
    """One Range request; returns (status, total_size from Content-Range)."""
    began = time.monotonic()
    total_size = 0
    async with client.stream(
        "GET", url, headers={"Range": f"bytes={start}-{start + length - 1}"}
    ) as res:
        if res.status_code not in (200, 206):
            result.ok = False
            result.errors.append(f"range {start}: HTTP {res.status_code}")
            return res.status_code, 0
        content_range = res.headers.get("content-range", "")
        if "/" in content_range:
            try:
                total_size = int(content_range.rsplit("/", 1)[1])
            except ValueError:
                total_size = 0
        first = True
        async for chunk in res.aiter_bytes(64 * 1024):
            if first:
                result.first_byte_ms.append((time.monotonic() - began) * 1000)
                first = False
            result.bytes_read += len(chunk)
    return res.status_code, total_size


async def run_listener(
    idx: int, base: str, channel_id: str, token: str
) -> ListenerResult:
    # One shared login: the auth endpoint is (correctly) rate-limited per IP,
    # and real listeners hold their own sessions anyway.
    result = ListenerResult(listener=idx)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=120.0)) as client:
            client.headers["Authorization"] = f"Bearer {token}"

            join = await client.post(f"{base}/music/channels/{channel_id}/join")
            if join.status_code not in (204, 200):
                result.ok = False
                result.errors.append(f"join: HTTP {join.status_code}")
                return result

            state_res = await client.get(f"{base}/music/channels/{channel_id}/state")
            state_res.raise_for_status()
            state = state_res.json()
            track = state.get("track") or (state["playlist"][0] if state["playlist"] else None)
            if not track:
                result.ok = False
                result.errors.append("channel has no playlist")
                return result

            url_res = await client.get(
                f"{base}/music/channels/{channel_id}/tracks/{track['id']}/stream-url"
            )
            url_res.raise_for_status()
            stream_url = url_res.json()["url"]
            if stream_url.startswith("/"):
                stream_url = base.rsplit("/api/v1", 1)[0] + stream_url

            # Browser-ish pattern: head probe, sequential chunks with pauses.
            _, total_size = await ranged_read(client, stream_url, 0, HEAD_PROBE_BYTES, result)
            offset = HEAD_PROBE_BYTES
            for _ in range(CHUNKS_PER_LISTENER):
                await asyncio.sleep(random.uniform(*PAUSE_RANGE_S))
                await ranged_read(client, stream_url, offset, CHUNK_BYTES, result)
                offset += CHUNK_BYTES
                if total_size and offset >= total_size:
                    break
            if total_size > 2 * CHUNK_BYTES:
                for _ in range(RANDOM_SEEKS):
                    seek_to = random.randint(0, max(0, total_size - CHUNK_BYTES - 1))
                    await asyncio.sleep(random.uniform(*PAUSE_RANGE_S))
                    await ranged_read(client, stream_url, seek_to, CHUNK_BYTES, result)
    except Exception as exc:  # noqa: BLE001 - report, don't crash the run
        result.ok = False
        result.errors.append(f"{type(exc).__name__}: {exc}")
    return result


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000/api/v1")
    parser.add_argument("--channel-id", required=True)
    parser.add_argument("--listeners", type=int, default=25)
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="Admin123!@#")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        token = await login(client, base, args.username, args.password)

    started = time.monotonic()
    results = await asyncio.gather(
        *(
            run_listener(i, base, args.channel_id, token)
            for i in range(args.listeners)
        )
    )
    elapsed = time.monotonic() - started

    failed = [r for r in results if not r.ok]
    ttfb = sorted(ms for r in results for ms in r.first_byte_ms)
    total_bytes = sum(r.bytes_read for r in results)

    print(f"listeners: {len(results)}  failed: {len(failed)}  wall: {elapsed:.1f}s")
    print(f"bytes read: {total_bytes / 1e6:.1f} MB")
    if ttfb:
        p50 = statistics.quantiles(ttfb, n=100)[49] if len(ttfb) > 1 else ttfb[0]
        p95 = statistics.quantiles(ttfb, n=100)[94] if len(ttfb) > 1 else ttfb[0]
        print(f"first-byte latency ms: p50={p50:.0f} p95={p95:.0f} max={max(ttfb):.0f}")
    for r in failed:
        print(f"  listener {r.listener}: {'; '.join(r.errors)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
