"""Visibility checks shared by document files and sources."""
from sqlalchemy import select
from app.core.exceptions import NotFoundError
from app.modules.docs.models import DocPage

async def visible_upload(db, user, attachment_id):
    page = (await db.execute(select(DocPage).where(DocPage.source_attachment_id == attachment_id))).scalar_one_or_none()
    if page is not None and page.status == "archived" and not user.is_super_admin():
        return False
    return True

async def require_visible_upload(db, user, attachment_id):
    if not await visible_upload(db, user, attachment_id):
        raise NotFoundError("Documentation attachment", attachment_id)
