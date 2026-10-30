"""Exercise membership invariants on PostgreSQL, rolling back all test data.

Opt in against a migrated local database with PMP_MEMBERSHIP_DB_TESTS=1.
No users are created or modified and no notifications are sent.
"""
import os
from datetime import date, timedelta
from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine
from app.core.current_user import CurrentUser
from app.core.exceptions import BusinessRuleError, ValidationAppError
from app.modules.identity.models import User
from app.modules.projects import membership, service, ai_generation
from app.modules.projects.models import Phase, Product, ProjectMember
from app.modules.projects.schemas import (
    ProductCreate, ProductUpdate, ProjectCreate, ProjectUpdate,
    ProjectMemberCreate, TaskCreate, TaskUpdate,
)

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in required")


@pytest.mark.asyncio
async def test_membership_chain_persistence_and_rejections(monkeypatch):
    monkeypatch.setattr(service.event_bus, "publish", AsyncMock())
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                users = list((await db.execute(select(User.id).where(User.is_active.is_(True)).limit(3))).scalars())
                assert len(users) == 3, "Local test requires three active users"
                owner, member, outsider = users
                actor = CurrentUser(user_id=owner, email="test@example.com", full_name="Test", roles=["SuperAdmin"], permissions=[])
                product = await service.create_product(db, ProductCreate(name=f"Membership test {uuid4()}", owner_user_id=owner, member_user_ids=[member, member]))
                assert set(product.member_user_ids) == {owner, member}
                assert {u.id for u in await membership.product_people(db, product.id)} == {owner, member}
                # Owner cannot be removed, and duplicate selections are harmless.
                updated = await service.update_product(db, product.id, ProductUpdate(member_user_ids=[member]))
                assert set(updated.member_user_ids) == {owner, member}
                with pytest.raises(ValidationAppError, match="product line"):
                    await service.create_project(db, ProjectCreate(product_id=product.id, name="Rejected"), created_by_user_id=outsider)
                project = await service.create_project(db, ProjectCreate(product_id=product.id, name="Membership project"), created_by_user_id=owner)
                phase = Phase(project_id=project.id, name="Sprint 1", start_date=date.today(), end_date=date.today()+timedelta(days=13))
                db.add(phase)
                await db.flush()
                with pytest.raises(ValidationAppError, match="product line"):
                    await service.add_project_member(db, project.id, ProjectMemberCreate(user_id=outsider, role="Developer"))
                with pytest.raises(ValidationAppError, match="active members"):
                    await service.create_task(db, TaskCreate(title="Rejected assignment", phase_id=phase.id, assignee_user_ids=[member]))
                with pytest.raises(ValidationAppError, match="project and sprint"):
                    await service.create_task(db, TaskCreate(title="Rejected backlog", assignee_user_ids=[owner]))
                with pytest.raises(ValidationAppError, match="active members"):
                    await service.create_task(db, TaskCreate(title="Rejected ticket", phase_id=phase.id, is_ticket=True, ticket_recipient_user_ids=[outsider]), created_by_user_id=owner)
                with pytest.raises(ValidationAppError, match="active members"):
                    await ai_generation._create_generated_tasks_batch(db, sprints=[phase], draft=SimpleNamespace(tasks=[SimpleNamespace(assignee_user_id=outsider)]), run_id=uuid4(), user_id=owner)
                await service.add_project_member(db, project.id, ProjectMemberCreate(user_id=member, role="Developer"))
                assert {u.id for u in await membership.project_people(db, project.id)} == {owner, member}
                with pytest.raises(BusinessRuleError, match="projects before"):
                    await service.update_product(db, product.id, ProductUpdate(member_user_ids=[]))
                task = await service.create_task(db, TaskCreate(title="Eligible assignment", phase_id=phase.id, assignee_user_ids=[member], reviewer_user_id=owner))
                assert task.assignee_user_ids == [member]
                with pytest.raises(ValidationAppError, match="active members"):
                    await service.update_task(db, task.id, TaskUpdate(assignee_user_ids=[outsider]), actor)
                with pytest.raises(ValidationAppError, match="active members"):
                    await service.update_task(db, task.id, TaskUpdate(reviewer_user_id=outsider), actor)
                with pytest.raises(BusinessRuleError, match="Unassign"):
                    await service.remove_project_member(db, project.id, member)
                with pytest.raises(BusinessRuleError, match="Unassign"):
                    await service.detach_task_from_phase(db, task.id)
                other = await service.create_product(db, ProductCreate(name=f"Other membership test {uuid4()}", owner_user_id=owner))
                with pytest.raises(ValidationAppError, match="product line"):
                    await service.update_project(db, project.id, ProjectUpdate(product_id=other.id))
                other_project = await service.create_project(db, ProjectCreate(product_id=other.id, name="Other project"), created_by_user_id=owner)
                other_phase = Phase(project_id=other_project.id, name="Sprint 1")
                db.add(other_phase)
                await db.flush()
                with pytest.raises(ValidationAppError, match="active members"):
                    await service.attach_task_to_phase(db, task.id, other_phase.id)
                # Clear assignments before removing nested membership.
                await service.update_task(db, task.id, TaskUpdate(assignee_user_ids=[], reviewer_user_id=None), actor)
                await service.remove_project_member(db, project.id, member)
                await service.update_product(db, product.id, ProductUpdate(member_user_ids=[]))
                assert {u.id for u in await membership.product_people(db, product.id)} == {owner}
                assert {u.id for u in await membership.project_people(db, project.id)} == {owner}
                await service.update_product(db, product.id, ProductUpdate(member_user_ids=[outsider]))
                assert {u.id for u in await membership.product_people(db, product.id)} == {owner, outsider}
                with pytest.raises(ValidationAppError):
                    await service.update_product(db, product.id, ProductUpdate(member_user_ids=[uuid4()]))
            finally:
                await db.close()
                await transaction.rollback()
    await engine.dispose()
