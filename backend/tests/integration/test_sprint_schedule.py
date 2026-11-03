"""Scheduled sprint transitions are persisted and audited in PostgreSQL."""

import json
import os
from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app  # noqa: F401 - register model mappings
from app.core.audit import register_audit_listeners
from app.core.database import engine
from app.core.events import event_bus
from app.modules.identity.models import User
from app.modules.projects.models import Phase, Product, Project
from app.modules.projects.sprint_schedule import start_due_sprints

pytestmark = pytest.mark.skipif(os.getenv("PMP_HISTORY_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")


@pytest.mark.asyncio
async def test_due_sprints_start_once_and_keep_explicit_states(monkeypatch):
    register_audit_listeners()
    events = []
    monkeypatch.setattr(event_bus, "publish_sync_fire_and_forget", events.append)
    today = date(1900, 1, 10)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                owner = (await db.execute(select(User.id).limit(1))).scalar_one()
                product = Product(name=f"Sprint schedule {uuid4()}", owner_user_id=owner)
                db.add(product)
                await db.flush()
                project = Project(product_id=product.id, name="Active project", status="in-progress")
                archived = Project(product_id=product.id, name="Archived project", status="archived")
                db.add_all([project, archived])
                await db.flush()
                phases = [
                    Phase(project_id=project.id, name="Today", start_date=today, end_date=today + timedelta(days=3)),
                    Phase(project_id=project.id, name="Past", start_date=today - timedelta(days=5), end_date=today - timedelta(days=1)),
                    Phase(project_id=project.id, name="Future", start_date=today + timedelta(days=1)),
                    Phase(project_id=project.id, name="Blocked", start_date=today, status="blocked"),
                    Phase(project_id=project.id, name="Complete", start_date=today, status="completed"),
                    Phase(project_id=project.id, name="Non-sprint", start_date=today, is_sprint=False),
                    Phase(project_id=archived.id, name="Archived", start_date=today),
                ]
                db.add_all(phases)
                await db.commit()
                events.clear()

                assert await start_due_sprints(db, today=today) == 2
                assert [phase.status for phase in phases] == ["in-progress", "in-progress", "not-started", "blocked", "completed", "not-started", "not-started"]
                change = next(event for event in events if event.entity_id == str(phases[0].id))
                assert json.loads(change.changes_json)["status"] == {"old": "not-started", "new": "in-progress"}
                assert change.user_id is None
                assert any(event.entity_id == str(project.id) and "sprints" in json.loads(event.changes_json) for event in events)
                events.clear()
                assert await start_due_sprints(db, today=today) == 0
                assert not events
            finally:
                await db.close()
                await transaction.rollback()
    await engine.dispose()
