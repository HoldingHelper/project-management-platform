"""Database-backed worker for AI project generation jobs."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, engine
from app.core.logging import configure_logging
from app.core.storage import file_storage_service
from app.modules.projects.ai_generation import (
    claim_next_generation_job,
    run_claimed_generation_job,
)
from app.modules.projects.models import GenerationRun

settings = get_settings()
logger = structlog.get_logger(__name__)


async def _mark_failed(job_id, exc: Exception) -> None:
    async with AsyncSessionLocal() as db:
        run = await db.get(GenerationRun, job_id)
        if run is None:
            return
        run.status = "failed"
        run.error = str(exc)
        run.updated_at = datetime.now(timezone.utc)
        await db.commit()


async def _run_once() -> bool:
    async with AsyncSessionLocal() as db:
        job_id = await claim_next_generation_job(db)
    if job_id is None:
        return False

    logger.info("generation_worker_claimed_job", job_id=str(job_id))
    try:
        async with AsyncSessionLocal() as db:
            await run_claimed_generation_job(db, job_id=job_id)
    except Exception as exc:  # noqa: BLE001
        await _mark_failed(job_id, exc)
        logger.exception("generation_worker_job_failed", job_id=str(job_id), error=str(exc))
    return True


async def main() -> None:
    configure_logging(debug=settings.debug)
    try:
        file_storage_service.ensure_bucket()
    except Exception as exc:  # noqa: BLE001
        logger.warning("generation_worker_storage_bucket_init_failed", error=str(exc))

    logger.info(
        "generation_worker_started",
        poll_seconds=settings.project_ai_worker_poll_seconds,
        batch_size=settings.project_ai_worker_batch_size,
    )
    try:
        while True:
            did_work = False
            for _ in range(settings.project_ai_worker_batch_size):
                did_work = await _run_once() or did_work
            if not did_work:
                await asyncio.sleep(settings.project_ai_worker_poll_seconds)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
