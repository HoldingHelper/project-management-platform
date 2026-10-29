"""Deletion of uploaded documentation, bounded by its original resource."""
import asyncio
import logging

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.storage import file_storage_service
from app.modules.collaboration.authorization import authorize_entity_access
from app.modules.collaboration.models import FileAttachment
from app.modules.docs.upload_library import resolve_location


async def require_project_document_manager(db, user, project):
    """A broad permission or upload ownership cannot replace project assignment."""
    from app.modules.projects import repository
    role = await repository.get_project_member_role(db, project.id, user.user_id)
    if role == "ProjectManager":
        return
    if getattr(project, "org_node_id", None):
        from app.modules.authz.service import authorize
        from app.modules.org.models import OrgNode
        node = await db.get(OrgNode, project.org_node_id)
        if node:
            result = await authorize(db, user, "update", node)
            if set(result.effective_roles) & {"project_manager", "project_owner"}:
                return
    raise ForbiddenError("You can delete documents only in projects you manage.")


async def require_delete_access(db, user, attachment):
    if attachment.entity_type not in {"product", "project", "task"}:
        raise ForbiddenError("This attachment cannot be deleted here.")
    await authorize_entity_access(db, user, attachment.entity_type, attachment.entity_id)
    if not user.allow_role_bypass:
        write_permissions = {
            "product": ("products.update", "products.manage_all"),
            "project": ("projects.manage_assigned", "projects.manage_all"),
            "task": ("tasks.edit_assigned", "tasks.manage_team", "tasks.manage_all"),
        }
        if not user.has_any_permission(*write_permissions[attachment.entity_type]):
            raise ForbiddenError("This token does not allow document deletion.")
    location = await resolve_location(db, attachment.entity_type, attachment.entity_id)
    if not location:
        raise NotFoundError("Document resource", attachment.entity_id)
    product, project, task = location
    if "ProjectManager" in user.roles and not (user.is_super_admin() or (user.allow_role_bypass and any(role in user.roles for role in ["CLevel", "CompanyManager"]))):
        if not project:
            raise ForbiddenError("You can delete documents only in projects you manage.")
        await require_project_document_manager(db, user, project)
        return
    if attachment.uploaded_by_user_id == user.user_id or (product and product.owner_user_id == user.user_id):
        return
    if user.allow_role_bypass and (user.is_super_admin() or "CLevel" in user.roles):
        return
    if user.allow_role_bypass and any(role in user.roles for role in ["CompanyManager", "ProjectManager"]):
        if project:
            from app.modules.projects.service import require_project_manage_access
            await require_project_manage_access(db, project.id, user)
            return
        if "CompanyManager" in user.roles and product:
            from app.modules.authz.service import authorize
            from app.modules.org.models import OrgNode
            node = await db.get(OrgNode, product.org_node_id) if product.org_node_id else None
            if node:
                await authorize(db, user, "update", node)
                return
        if "CompanyManager" in user.roles and task:
            from app.modules.projects.service import require_task_edit_access
            await require_task_edit_access(db, user, task.id)
            return
    raise ForbiddenError("Only the owner or an authorized manager can delete this document.")


async def get_attachment(db, attachment_id):
    attachment = await db.get(FileAttachment, attachment_id)
    if attachment is None:
        raise NotFoundError("FileAttachment", attachment_id)
    return attachment


async def delete_document(db, user, attachment_id):
    attachment = await get_attachment(db, attachment_id)
    await require_delete_access(db, user, attachment)
    if attachment.entity_type == "product":
        from app.modules.projects.models import Product
        from sqlalchemy import select
        product = (await db.execute(select(Product).where(Product.id == attachment.entity_id).with_for_update())).scalar_one()
        if product.documentation_link == f"attachment:{attachment.id}":
            product.documentation_link = None
    key = attachment.storage_key
    # Cascades remove the managed Docs page, links, and attachment metadata.
    await db.delete(attachment)
    await db.commit()
    try:
        await asyncio.to_thread(file_storage_service.delete, key)
    except Exception:
        logging.getLogger(__name__).exception("Could not clean up deleted document storage")
