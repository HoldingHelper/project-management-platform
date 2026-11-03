"""Real PostgreSQL schedule creation/editing, with all test writes rolled back."""
import os
from datetime import date, timedelta
from uuid import uuid4
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine
from app.core.exceptions import ValidationAppError
from app.modules.identity.models import User
from app.modules.projects import service
from app.modules.projects.models import Product, Project
from app.modules.projects.schemas import ProjectCreate, ProjectUpdate, ProjectSprintCreate, SprintBatchCreate, PhaseUpdate, PhaseCreate

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")

@pytest.mark.asyncio
async def test_mixed_project_plan_batch_and_sprint_edit(monkeypatch):
    monkeypatch.setattr(service.event_bus, "publish", AsyncMock())
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                owner = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                product = Product(name=f"Sprint test {uuid4()}", owner_user_id=owner)
                db.add(product); await db.flush()
                start = date(2028, 2, 28)
                inputs = []
                cursor = start
                for duration in (3, 7, 14):
                    inputs.append(ProjectSprintCreate(name=f"Sprint {duration}", start_date=cursor, duration_days=duration))
                    cursor += timedelta(days=duration)
                project = await service.create_project(db, ProjectCreate(product_id=product.id, name="Mixed duration plan", sprints=inputs), created_by_user_id=owner)
                assert project.start_date == start and project.end_date == date(2028, 3, 22)
                phases = await service.list_phases_by_project(db, project.id)
                assert [phase.duration_days for phase in phases] == [3, 7, 14]
                revised = await service.update_project(db, project.id, ProjectUpdate(start_date=date(2028, 2, 25), end_date=date(2028, 4, 10)))
                assert (revised.start_date, revised.end_date) == (date(2028, 2, 25), date(2028, 4, 10))
                unchanged_phases = await service.list_phases_by_project(db, project.id)
                assert [(p.start_date, p.end_date) for p in unchanged_phases] == [(p.start_date, p.end_date) for p in phases]
                with pytest.raises(ValidationAppError, match="before"):
                    await service.update_project(db, project.id, ProjectUpdate(start_date=date(2028, 5, 1)))
                for duration in (3, 7, 14):
                    batch = await service.create_sprint_batch(db, project.id, SprintBatchCreate(name="Batch", start_date=date(2028, 4, 1), count=3, duration_days=duration))
                    assert len(batch) == 3
                    assert batch[-1].end_date == date(2028, 4, 1) + timedelta(days=duration*3-1)
                    assert all((b.start_date - a.end_date).days == 1 for a,b in zip(batch,batch[1:]))
                edited = await service.update_phase(db, phases[0].id, PhaseUpdate(start_date=date(2028, 5, 1), duration_days=7))
                assert edited.end_date == date(2028, 5, 7)
                with pytest.raises(ValidationAppError, match="read-only"):
                    await service.update_phase(db, edited.id, PhaseUpdate(end_date=date(2028, 6, 1)))
                single = await service.create_phase(db, PhaseCreate(project_id=project.id, name="Three days", start_date=date(2028, 6, 1), duration_days=3))
                assert single.end_date == date(2028, 6, 3)
            finally:
                await db.close()
                await root.rollback()
    await engine.dispose()
