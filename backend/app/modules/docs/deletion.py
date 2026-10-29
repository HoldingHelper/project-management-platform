"""Delete authorization for native Docs pages and connected uploaded files."""
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.docs import repository as repo


async def require_page_delete_access(db, user, page):
    from app.modules.docs.service import get_page
    from app.modules.collaboration.document_deletion import get_attachment, require_delete_access, require_project_document_manager
    from app.modules.docs.upload_library import resolve_location
    from app.modules.collaboration.authorization import authorize_entity_access

    await get_page(db, user, page.id)
    if page.source_attachment_id:
        await require_delete_access(db, user, await get_attachment(db, page.source_attachment_id))
        return
    if page.source_entity_type:
        raise ForbiddenError("Upload folders are managed automatically. Delete individual documents instead.")
    if not user.allow_role_bypass and not user.has_any_permission("docs.manage", "docs.edit"):
        raise ForbiddenError("This token does not allow document deletion.")

    links = await repo.list_links(db, page.id)
    space = await repo.get_space(db, page.space_id)
    scopes = {(link.entity_type, link.entity_id) for link in links if link.entity_type in {"product", "project", "task"}}
    if not scopes:
        parent_id = page.parent_page_id
        visited = {page.id}
        while parent_id and parent_id not in visited:
            visited.add(parent_id)
            parent = await repo.get_page(db, parent_id)
            if not parent:
                break
            if parent.source_entity_type in {"project", "task", "product"} and parent.source_entity_id:
                scopes.add((parent.source_entity_type, parent.source_entity_id))
                break
            parent_id = parent.parent_page_id
    if not scopes and space:
        if space.product_id:
            scopes.add(("product", space.product_id))
        if space.task_id:
            scopes.add(("task", space.task_id))
        if space.node_id:
            from app.modules.org.models import OrgNode
            node = await db.get(OrgNode, space.node_id)
            if node and node.source_type in {"project", "task", "product"} and node.source_id:
                scopes.add((node.source_type, node.source_id))
    locations = []
    for kind, entity_id in scopes:
        await authorize_entity_access(db, user, kind, entity_id)
        location = await resolve_location(db, kind, entity_id)
        if not location:
            raise NotFoundError("Document resource", entity_id)
        locations.append(location)

    privileged = user.allow_role_bypass and (user.is_super_admin() or "CLevel" in user.roles)
    company_manager = user.allow_role_bypass and "CompanyManager" in user.roles
    owner = user.user_id in {page.created_by, page.responsible_user_id}
    if privileged:
        return
    if "ProjectManager" in user.roles and not company_manager:
        if not locations:
            if owner and not (space and space.node_id):
                return
            raise ForbiddenError("You can delete documents only in projects you manage.")
        for _, project, _ in locations:
            if not project:
                raise ForbiddenError("You can delete documents only in projects you manage.")
            await require_project_document_manager(db, user, project)
        return
    if owner:
        return
    if company_manager:
        from app.modules.authz.service import authorize
        from app.modules.org.models import OrgNode
        nodes = {getattr(product, "org_node_id", None) for product, _, _ in locations if product}
        if space and space.node_id:
            nodes.add(space.node_id)
        nodes.discard(None)
        if nodes:
            for node_id in nodes:
                node = await db.get(OrgNode, node_id)
                if not node:
                    raise NotFoundError("Organization node", node_id)
                await authorize(db, user, "update", node)
            return
    raise ForbiddenError("Only the owner or an authorized manager can delete this document.")
