"""Advance scheduled sprints without overriding explicit workflow states."""

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.projects.enums import PhaseStatus, ProjectStatus
from app.modules.projects.models import Phase, Project


async def start_due_sprints(db: AsyncSession, *, today: date | None = None) -> int:
    today = today or datetime.now(timezone.utc).date()
    result = await db.execute(
        select(Phase)
        .join(Project, Phase.project_id == Project.id)
        .where(
            Phase.is_sprint.is_(True),
            Phase.status == PhaseStatus.NOT_STARTED.value,
            Phase.start_date <= today,
            Project.status.not_in((
                ProjectStatus.ARCHIVED.value,
                ProjectStatus.CANCELLED.value,
                ProjectStatus.COMPLETED.value,
                ProjectStatus.ON_HOLD.value,
            )),
        )
        .with_for_update(of=Phase, skip_locked=True)
    )
    phases = result.scalars().all()
    for phase in phases:
        phase.status = PhaseStatus.IN_PROGRESS.value
    if phases:
        await db.commit()
    return len(phases)
