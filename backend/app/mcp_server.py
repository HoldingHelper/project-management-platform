"""Standalone CLI stdio runner for Project Management Platform MCP Server.

Usage with Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "project-management-platform": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/path/to/backend",
      "env": {"PMP_MCP_TOKEN": "pmp_mcp_..."}
    }
  }
}
```
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

from app.core.database import AsyncSessionLocal
from app.modules.mcp.service import resolve_principal
from app.modules.mcp.server import process_jsonrpc_request


async def stdio_server_loop() -> None:
    """Read JSON-RPC from stdin line by line and output responses to stdout."""
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line_bytes = await reader.readline()
        if not line_bytes:
            break

        line = line_bytes.decode().strip()
        if not line:
            continue

        try:
            req = json.loads(line)
            raw_token = os.environ.get("PMP_MCP_TOKEN", "")
            async with AsyncSessionLocal() as db:
                user, _token = await resolve_principal(db, raw_token)
            resp = await process_jsonrpc_request(req, user)
            if "id" not in req:
                continue
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
        except Exception as exc:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": str(exc)},
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()


def main() -> None:
    asyncio.run(stdio_server_loop())


if __name__ == "__main__":
    main()
