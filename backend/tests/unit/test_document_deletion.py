"""Uploaded files and messages are retained for every role."""
from unittest.mock import AsyncMock
from uuid import uuid4
import pytest
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.collaboration import document_deletion
from app.modules.chat import service as chat
from app.modules.docs import sources_service

@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["Developer", "ProjectManager", "CompanyManager", "CLevel", "SuperAdmin"])
async def test_all_file_and_message_deletion_paths_fail_closed(role):
    db = AsyncMock()
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=[role], permissions=["*"])
    for call in [
        document_deletion.require_delete_access(db, actor, object()),
        document_deletion.delete_document(db, actor, uuid4()),
        chat.delete_message(db, uuid4(), actor.user_id),
        sources_service.delete_source(db, actor, uuid4()),
    ]:
        with pytest.raises(ForbiddenError):
            await call
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()
