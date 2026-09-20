"""Standalone Production Initializer: Bootstraps RBAC catalog and root SuperAdmin.

Leaves the database completely clean with 0 dummy projects, 0 dummy tasks,
0 dummy departments, and 0 dummy users, ready for the administrator to set up
their organization.
"""

from __future__ import annotations

import asyncio
import structlog

from app.core.database import AsyncSessionLocal
from app.modules.identity.seed import run_seed

logger = structlog.get_logger(__name__)


async def main() -> None:
    logger.info("initializing_production_rbac_and_admin")
    async with AsyncSessionLocal() as db:
        await run_seed(db)
    logger.info("production_rbac_and_admin_ready")


if __name__ == "__main__":
    asyncio.run(main())
