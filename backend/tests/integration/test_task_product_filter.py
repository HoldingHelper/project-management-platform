"""Task product-line filtering before pagination, with rollback-only PostgreSQL."""
import os
from uuid import uuid4
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.identity.models import User
from app.modules.org import models as org_models
from app.modules.projects import service
from app.modules.projects.models import Product, Project, Phase, TaskItem

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")

@pytest.mark.asyncio
async def test_task_product_filter_pagination_composition_and_access():
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
                owner = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                products = [Product(name=f"Filter {uuid4()}", owner_user_id=owner) for _ in range(2)]
                db.add_all(products); await db.flush()
                projects = [Project(name=f"Project {i}", product_id=product.id) for i, product in enumerate(products)]
                db.add_all(projects); await db.flush()
                phases = [Phase(name="Sprint", project_id=project.id) for project in projects]
                db.add_all(phases); await db.flush()
                tasks = [TaskItem(title="Product task A", phase_id=phases[0].id, status="Ready"), TaskItem(title="Product task B", phase_id=phases[0].id, status="Done"), TaskItem(title="Other product", phase_id=phases[1].id), TaskItem(title="Backlog", phase_id=None)]
                db.add_all(tasks); await db.flush()
                admin = CurrentUser(owner, "admin@example.com", "Admin", ["SuperAdmin"])
                first, total = await service.list_tasks(db, current_user=admin, product_id=products[0].id, page_size=1)
                second, next_total = await service.list_tasks(db, current_user=admin, product_id=products[0].id, page=2, page_size=1)
                assert total == next_total == 2
                assert {item.id for item in first + second} == {tasks[0].id, tasks[1].id}
                done, total = await service.list_tasks(db, current_user=admin, product_id=products[0].id, status="Done")
                assert total == 1 and done[0].id == tasks[1].id
                assert await service.list_tasks(db, current_user=admin, product_id=products[0].id, unattached=True) == ([], 0)
                assert await service.list_tasks(db, current_user=admin, product_id=uuid4()) == ([], 0)
                stranger = CurrentUser(uuid4(), "other@example.com", "Other", ["Developer"], ["tasks.view", "products.view_assigned"])
                with pytest.raises(ForbiddenError):
                    await service.list_tasks(db, current_user=stranger, product_id=products[0].id)
        finally:
            await transaction.rollback()
    await engine.dispose()
