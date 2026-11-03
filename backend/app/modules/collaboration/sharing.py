"""One authorization boundary for file downloads and Telegram delivery."""
from sqlalchemy import select

from app.core.audit import record_audit_change
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.collaboration.authorization import authorize_entity_access
from app.modules.collaboration.models import FileAttachment
from app.modules.docs.models import DocAttachment, DocPage


def require_download_enabled(attachment):
    if not attachment.download_share_enabled:
        raise ForbiddenError("Download and Telegram sharing are disabled for this file.")


def can_manage(user, owner_id):
    return user.is_super_admin() or (user.user_id == owner_id and (user.allow_role_bypass or user.has_any_permission("docs.edit", "docs.manage")))


async def get_file(db, user, attachment_id):
    attachment = await db.get(FileAttachment, attachment_id)
    if attachment is None:
        raise NotFoundError("FileAttachment", attachment_id)
    await authorize_entity_access(db, user, attachment.entity_type, attachment.entity_id)
    from app.modules.docs.lifecycle import require_visible_upload
    await require_visible_upload(db, user, attachment.id)
    return attachment


async def file_permission(db, user, attachment_id):
    item = await get_file(db, user, attachment_id)
    return {"enabled": item.download_share_enabled, "can_manage": can_manage(user, item.uploaded_by_user_id)}


async def set_file_permission(db, user, attachment_id, enabled):
    item = await get_file(db, user, attachment_id)
    if not can_manage(user, item.uploaded_by_user_id):
        raise ForbiddenError("Only the file owner or a Super Admin can change sharing permission.")
    old = item.download_share_enabled
    item.download_share_enabled = enabled
    if old != enabled:
        page = (await db.execute(select(DocPage).where(DocPage.source_attachment_id == item.id))).scalar_one_or_none()
        if page:
            record_audit_change(db.sync_session, "docs.DocPage", page.id, {"download_share_enabled": {"old": old, "new": enabled}})
    await db.commit()
    return {"enabled": enabled, "can_manage": True}


async def doc_attachment(db, user, attachment_id):
    attachment = await db.get(DocAttachment, attachment_id)
    if not attachment:
        raise NotFoundError("Documentation attachment", attachment_id)
    from app.modules.docs.service import get_page
    page = await get_page(db, user, attachment.page_id)
    if page.source_attachment_id:
        return attachment, await get_file(db, user, page.source_attachment_id)
    return attachment, attachment


async def doc_permission(db, user, attachment_id):
    attachment, source = await doc_attachment(db, user, attachment_id)
    owner = source.uploaded_by_user_id if isinstance(source, FileAttachment) else source.uploaded_by
    return {"enabled": source.download_share_enabled, "can_manage": can_manage(user, owner)}


async def set_doc_permission(db, user, attachment_id, enabled):
    attachment, source = await doc_attachment(db, user, attachment_id)
    if isinstance(source, FileAttachment):
        return await set_file_permission(db, user, source.id, enabled)
    if not can_manage(user, source.uploaded_by):
        raise ForbiddenError("Only the file owner or a Super Admin can change sharing permission.")
    source.download_share_enabled = enabled
    await db.commit()
    return {"enabled": enabled, "can_manage": True}
