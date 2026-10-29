"""Membership invariants shared by REST, MCP, GraphQL and AI generation."""
from sqlalchemy import delete, or_, select
from app.core.exceptions import BusinessRuleError, NotFoundError, ValidationAppError
from app.modules.identity.models import User
from app.modules.projects.models import Product, ProductMember, Project, ProjectMember, Phase, TaskItem, TaskAssignee


async def active_users(db, user_ids):
    ids = set(user_ids)
    if not ids:
        return
    found = set((await db.execute(select(User.id).where(User.id.in_(ids), User.is_active.is_(True)))).scalars().all())
    if ids - found:
        raise ValidationAppError("Choose active users for membership.", errors={"member_user_ids": ["One or more selected users are inactive or unavailable."]})


async def lock_product(db, product_id):
    product = (await db.execute(select(Product).where(Product.id == product_id).with_for_update())).scalar_one_or_none()
    if product is None:
        raise NotFoundError("Product line", product_id)
    return product


async def require_product_members(db, product_id, user_ids):
    # Serialize admission against membership removal.
    product = await lock_product(db, product_id)
    allowed = set((await db.execute(select(ProductMember.user_id).where(ProductMember.product_id == product_id))).scalars().all()) | {product.owner_user_id}
    if set(user_ids) - allowed:
        raise ValidationAppError("Project members must belong to its product line. Add them to the product line first.", errors={"member_user_ids": ["Only product-line members may join this project."]})


async def replace_product_members(db, product, user_ids):
    requested = set(user_ids) | {product.owner_user_id}
    existing = set((await db.execute(select(ProductMember.user_id).where(ProductMember.product_id == product.id))).scalars().all())
    await active_users(db, requested - existing - {product.owner_user_id})
    removed = existing - requested
    if removed:
        linked = (await db.execute(select(ProjectMember.user_id).join(Project, Project.id == ProjectMember.project_id).where(Project.product_id == product.id, ProjectMember.user_id.in_(removed)).limit(1))).scalar_one_or_none()
        if linked is not None:
            raise BusinessRuleError("Remove this person from the product line's projects before removing product-line membership.")
        await db.execute(delete(ProductMember).where(ProductMember.product_id == product.id, ProductMember.user_id.in_(removed)))
    for user_id in requested - existing:
        db.add(ProductMember(product_id=product.id, user_id=user_id))


async def lock_project(db, project_id):
    project = (await db.execute(select(Project).where(Project.id == project_id).with_for_update())).scalar_one_or_none()
    if project is None:
        raise NotFoundError("Project", project_id)
    return project


async def require_project_assignees(db, phase_id, user_ids):
    ids = set(user_ids)
    if not ids:
        return
    if phase_id is None:
        raise ValidationAppError("Choose a project and sprint before assigning people.", errors={"assignee_user_ids": ["Backlog tasks must remain unassigned until they join a project."]})
    phase = await db.get(Phase, phase_id)
    if phase is None:
        raise NotFoundError("Sprint", phase_id)
    await lock_project(db, phase.project_id)
    allowed = set((await db.execute(select(ProjectMember.user_id).join(User, User.id == ProjectMember.user_id).where(ProjectMember.project_id == phase.project_id, User.is_active.is_(True)))).scalars().all())
    if ids - allowed:
        raise ValidationAppError("Tasks can only be assigned to active members of their project.", errors={"assignee_user_ids": ["Add the selected people to this project first."]})


async def require_no_assignments(db, project_id, user_id):
    await lock_project(db, project_id)
    assigned = (await db.execute(select(TaskItem.id).join(Phase, Phase.id == TaskItem.phase_id).outerjoin(TaskAssignee, TaskAssignee.task_id == TaskItem.id).where(Phase.project_id == project_id, or_(TaskAssignee.user_id == user_id, TaskItem.reviewer_user_id == user_id)).limit(1))).scalar_one_or_none()
    if assigned is not None:
        raise BusinessRuleError("Unassign this person's tasks and reviews before removing them from the project.")


async def product_people(db, product_id):
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product line", product_id)
    ids = select(ProductMember.user_id).where(ProductMember.product_id == product_id)
    return list((await db.execute(select(User).where(or_(User.id.in_(ids), User.id == product.owner_user_id)).order_by(User.first_name, User.last_name, User.id))).scalars().all())


async def project_people(db, project_id):
    return list((await db.execute(select(User).join(ProjectMember, ProjectMember.user_id == User.id).where(ProjectMember.project_id == project_id, User.is_active.is_(True)).order_by(User.first_name, User.last_name, User.id))).scalars().all())
