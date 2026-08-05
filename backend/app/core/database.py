"""Async SQLAlchemy engine/session management.

Each module owns its own Postgres *schema* (identity, organization, projects,
collaboration, blockers, analytics) even though, pragmatically, they all share a
single physical database and a single SQLAlchemy metadata/engine (a "modular
monolith", not a set of physically isolated databases). Cross-schema joins at
the ORM/query level are disallowed by convention (see docs/MODULE_GUIDE.md) --
modules must talk to each other only via their public `service` functions.
"""

from __future__ import annotations

from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.database_echo,
    pool_pre_ping=True,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for every module's ORM models."""

    pass


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a scoped AsyncSession per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
