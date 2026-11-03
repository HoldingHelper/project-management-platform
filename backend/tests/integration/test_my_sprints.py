"""Personal sprint selection and access, using rollback-only PostgreSQL data."""
import os
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import engine
from app.modules.identity.models import User
from app.modules.analytics import service
from app.modules.projects.models import Phase, Product, Project, TaskAssignee, TaskItem

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")


@pytest.mark.asyncio
async def test_personal_sprints_include_all_assigned_and_led_visible_sprints():
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                ids = list((await db.execute(select(User.id).where(User.is_active.is_(True)).limit(2))).scalars())
                actor = CurrentUser(ids[0], "owner@example.com", "Owner", ["Developer"], ["tasks.view"])
                products = [Product(name=f"Sprint list {uuid4()}", owner_user_id=ids[0]), Product(name=f"Private {uuid4()}", owner_user_id=ids[1])]
                db.add_all(products); await db.flush()
                projects = [Project(name="My project", product_id=products[0].id), Project(name="Other project", product_id=products[1].id), Project(name="Archived project", product_id=products[0].id, status="archived")]
                db.add_all(projects); await db.flush()
                phases = [Phase(name=f"Sprint {i}", project_id=projects[0].id, is_sprint=True, sequence=i) for i in range(8)]
                lead = Phase(name="Lead sprint", project_id=projects[0].id, is_sprint=True, lead_assignee_user_id=actor.user_id)
                unrelated = Phase(name="Other sprint", project_id=projects[0].id, is_sprint=True)
                nonsprint = Phase(name="Legacy phase", project_id=projects[0].id, is_sprint=False)
                private = Phase(name="Private sprint", project_id=projects[1].id, is_sprint=True, lead_assignee_user_id=actor.user_id)
                archived = Phase(name="Archived sprint", project_id=projects[2].id, is_sprint=True, lead_assignee_user_id=actor.user_id)
                db.add_all([*phases, lead, unrelated, nonsprint, private, archived]); await db.flush()
                tasks = [TaskItem(title=f"Task {i}", phase_id=phase.id, status="Done" if i == 0 else "Ready") for i, phase in enumerate(phases)]
                tasks += [TaskItem(title="Another task", phase_id=phases[0].id, status="Ready"), TaskItem(title="Archived task", phase_id=unrelated.id, status="Archived"), TaskItem(title="Legacy task", phase_id=nonsprint.id, status="Ready")]
                db.add_all(tasks); await db.flush()
                db.add_all([TaskAssignee(task_id=task.id, user_id=actor.user_id) for task in tasks]); await db.flush()
                rows = await service.get_personal_sprints(db, actor)
                by_id = {row.id: row for row in rows}
                assert {row.id for row in phases} | {lead.id} <= by_id.keys()
                assert not ({unrelated.id, nonsprint.id, private.id, archived.id} & by_id.keys())
                assert by_id[phases[0].id].assigned_tasks == 2
                assert by_id[phases[0].id].completed_tasks == 1
                assert by_id[lead.id].is_lead and by_id[lead.id].assigned_tasks == 0
            finally:
                await db.close(); await root.rollback()
    await engine.dispose()
