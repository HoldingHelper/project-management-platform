"""No role can delete native Docs pages."""
from unittest.mock import AsyncMock
from uuid import uuid4
import pytest
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.docs import deletion, service

@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["Developer", "ProjectManager", "CompanyManager", "CLevel", "SuperAdmin"])
async def test_every_role_including_author_and_super_admin_is_denied_deletion(role):
    db = AsyncMock()
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=[role], permissions=["docs.manage"])
    with pytest.raises(ForbiddenError, match="cannot be deleted"):
        await deletion.require_page_delete_access(db, actor, object())
    with pytest.raises(ForbiddenError, match="cannot be deleted"):
        await service.delete_page(db, actor, uuid4())
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()
