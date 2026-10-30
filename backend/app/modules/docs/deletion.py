"""Documents are retained; deletion is prohibited for every role."""
from app.core.exceptions import ForbiddenError

async def require_page_delete_access(db, user, page):
    raise ForbiddenError("Documents cannot be deleted. Archive the document instead.")
