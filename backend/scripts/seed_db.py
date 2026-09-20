"""Standalone DB seeder invoked by docker-entrypoint.sh (SEED_ON_STARTUP=true).

Opens one AsyncSession and runs the idempotent identity seed (RBAC catalog +
demo users). Safe to run repeatedly.
"""

from __future__ import annotations

import asyncio

from app.core.database import AsyncSessionLocal
from app.modules.docs.seed import seed_internal_documentation
from app.modules.identity.seed import run_seed


async def _main() -> None:
    async with AsyncSessionLocal() as db:
        await run_seed(db)
        await seed_internal_documentation(db)


if __name__ == "__main__":
    asyncio.run(_main())
