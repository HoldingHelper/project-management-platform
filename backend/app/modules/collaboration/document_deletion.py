"""Uploaded documents are retained; use the Docs archive lifecycle."""
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.collaboration.models import FileAttachment

async def get_attachment(db, attachment_id):
    attachment = await db.get(FileAttachment, attachment_id)
    if attachment is None:
        raise NotFoundError("FileAttachment", attachment_id)
    return attachment

async def require_delete_access(db, user, attachment):
    raise ForbiddenError("Documents cannot be deleted. Archive the document instead.")

async def delete_document(db, user, attachment_id):
    raise ForbiddenError("Documents cannot be deleted. Archive the document instead.")
