"""Data-access functions for the Analytics module."""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models import AuditLog


async def insert_audit_log(db: AsyncSession, entry: AuditLog) -> AuditLog:
    db.add(entry)
    await db.commit()
    return entry


async def list_recent_audit_logs(
    db: AsyncSession, limit: int = 20
) -> Sequence[AuditLog]:
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(limit)
    )
    return result.scalars().all()


async def list_audit_logs_for_entity(
    db: AsyncSession, entity_type: str, entity_id: str
) -> Sequence[AuditLog]:
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.occurred_at.desc())
    )
    return result.scalars().all()
