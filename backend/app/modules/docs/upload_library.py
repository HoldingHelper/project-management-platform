"""Transactional, idempotent indexing of work uploads in dedicated Docs spaces.

The original object is shared, never copied or exposed through a public URL.
Managed spaces/pages always retain the source entity's authorization boundary.
"""
from uuid import UUID
from sqlalchemy import select, text
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.docs.models import DocSpace, DocPage, DocAttachment, DocLink
from app.modules.collaboration.models import FileAttachment
from app.modules.projects.models import Product, Project, Phase, TaskItem


async def resolve_location(db, entity_type, entity_id):
    product = project = task = None
    if entity_type == "product":
        product = await db.get(Product, entity_id)
    elif entity_type == "project":
        project = await db.get(Project, entity_id)
    elif entity_type == "task":
        task = await db.get(TaskItem, entity_id)
        if task is None:
            return None
        if task.phase_id:
            phase = await db.get(Phase, task.phase_id)
            project = await db.get(Project, phase.project_id) if phase else None
    else:
        return None
    if project:
        product = await db.get(Product, project.product_id)
    if not product and not (task and not task.phase_id):
        return None
    return product, project, task


async def index_upload(db, attachment):
    location = await resolve_location(db, attachment.entity_type, attachment.entity_id)
    if not location:
        return None
    product, project, task = location
    scope_id = product.id if product else task.id
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": scope_id.int & ((1 << 63) - 1)})
    existing = (await db.execute(select(DocPage).where(DocPage.source_attachment_id == attachment.id))).scalar_one_or_none()
    scope = DocSpace.product_id == product.id if product else DocSpace.task_id == task.id
    space = (await db.execute(select(DocSpace).where(scope))).scalar_one_or_none()
    actor_id = attachment.uploaded_by_user_id
    if space is None:
        space = DocSpace(name=(product.name if product else f"Task: {task.title}")[:160], slug=f"product-{scope_id}" if product else f"task-{scope_id}", description="Uploaded documentation organized by product line, project, and task.", category="Platform", visibility="private", created_by=actor_id, product_id=product.id if product else None, task_id=task.id if not product else None)
        db.add(space)
        await db.flush()
    elif product and space.name != product.name[:160]:
        space.name = product.name[:160]

    async def folder(slug, title, parent, kind, entity_id):
        page = (await db.execute(select(DocPage).where(DocPage.space_id == space.id, DocPage.slug == slug))).scalar_one_or_none()
        if page is None:
            page = DocPage(space_id=space.id, slug=slug, title=title[:240], parent_page_id=parent.id if parent else None, content="", content_json={"upload_folder": True}, status="draft", visibility="inherit", created_by=actor_id, updated_by=actor_id, source_entity_type=kind, source_entity_id=entity_id)
            db.add(page)
            await db.flush()
        elif page.title != title[:240]:
            page.title = title[:240]
        return page

    parent = None
    if product:
        if project:
            parent = await folder("projects", "Projects", None, "product", product.id)
            parent = await folder(f"project-{project.id}", project.name, parent, "project", project.id)
        else:
            parent = await folder("documentation", "Documentation", None, "product", product.id)
    if task:
        parent = await folder(f"tasks-{project.id if project else task.id}", "Tasks", parent, "project" if project else "task", project.id if project else task.id)
        parent = await folder(f"task-{task.id}", task.title, parent, "task", task.id)
    if existing and existing.status in {"published", "archived"}:
        return existing
    if existing:
        existing.space_id = space.id
        existing.parent_page_id = parent.id if parent else None
        return existing
    page = DocPage(space_id=space.id, parent_page_id=parent.id if parent else None, title=attachment.file_name[:240], slug=f"upload-{attachment.id}", excerpt=f"Uploaded file · {attachment.file_name}"[:500], content=f"Uploaded documentation: {attachment.file_name}\n\nUse Download below to open the original file.", content_json={}, status="draft", visibility="inherit", created_by=actor_id, updated_by=actor_id, source_attachment_id=attachment.id, source_entity_type=attachment.entity_type, source_entity_id=attachment.entity_id)
    db.add(page)
    await db.flush()
    db.add(DocAttachment(page_id=page.id, file_name=attachment.file_name, file_url="", mime_type=attachment.content_type, uploaded_by=actor_id, storage_key=attachment.storage_key, size_bytes=attachment.size_bytes))
    db.add(DocLink(page_id=page.id, entity_type=attachment.entity_type, entity_id=attachment.entity_id))
    await db.flush()
    # Attach the original file before publishing: published pages are immutable.
    page.status = "published"
    await db.flush()
    return page


async def managed_access(db, user, resource_type, resource_id, action="view"):
    """Return None for regular Docs resources; managed uploads fail closed."""
    page = await db.get(DocPage, resource_id) if resource_type == "page" else None
    space = await db.get(DocSpace, page.space_id if page else resource_id) if resource_type in {"page", "space"} else None
    if not space or not (getattr(space, "product_id", None) or getattr(space, "task_id", None)):
        return None
    from app.modules.collaboration.authorization import authorize_entity_access
    try:
        await authorize_entity_access(db, user, "product" if space.product_id else "task", space.product_id or space.task_id)
        kind = page.source_entity_type if page else None
        entity_id = page.source_entity_id if page else None
        if kind and entity_id:
            await authorize_entity_access(db, user, kind, entity_id)
        if action != "view":
            kind = kind or ("product" if space.product_id else "task")
            entity_id = entity_id or space.product_id or space.task_id
            if kind == "project":
                from app.modules.projects.service import require_project_manage_access
                await require_project_manage_access(db, entity_id, user)
            elif kind == "task":
                from app.modules.projects.service import require_task_edit_access
                await require_task_edit_access(db, user, entity_id)
            elif not (user.is_super_admin() or user.has_any_permission("products.update", "products.manage_all")):
                return False
        return True
    except (ForbiddenError, NotFoundError):
        return False


async def backfill_uploads(db):
    uploads = (await db.execute(select(FileAttachment).where(FileAttachment.entity_type.in_(["product", "project", "task"])).order_by(FileAttachment.id))).scalars().all()
    count = 0
    for attachment in uploads:
        if await index_upload(db, attachment):
            count += 1
    return count
