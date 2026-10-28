"""Shared product-line visibility for REST, collaboration, and MCP callers."""
from sqlalchemy import or_, select
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permissions
from app.modules.projects.models import Product, Project, ProjectMember


def can_view_all_product_lines(actor: CurrentUser) -> bool:
    return actor.is_super_admin() or actor.has_permission(Permissions.PRODUCTS_MANAGE_ALL) or (
        actor.allow_role_bypass and actor.is_in_role("CLevel")
    )


async def visible_product_ids(db, actor: CurrentUser):
    if can_view_all_product_lines(actor):
        return None
    from app.modules.authz.service import visible_nodes
    nodes = await visible_nodes(db, actor)
    node_ids = [node.id for node in nodes]
    graph_product_ids = [node.source_id for node in nodes if node.source_type == "product" and node.source_id]
    project_membership = select(Project.product_id).join(ProjectMember, ProjectMember.project_id == Project.id).where(ProjectMember.user_id == actor.user_id)
    predicate = or_(
        Product.owner_user_id == actor.user_id,
        Product.id.in_(project_membership),
        Product.org_node_id.in_(node_ids),
        Product.id.in_(graph_product_ids),
        Product.id.in_(select(Project.product_id).where(Project.org_node_id.in_(node_ids))),
    )
    return list((await db.execute(select(Product.id).where(predicate))).scalars().all())


async def require_product_access(db, actor: CurrentUser, product_id) -> None:
    ids = await visible_product_ids(db, actor)
    if ids is not None and product_id not in ids:
        raise ForbiddenError("You are not a member of this product line.")
