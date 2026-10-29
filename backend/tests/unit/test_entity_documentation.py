"""Task and project documentation endpoints preserve resource access checks."""
import asyncio
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import UploadFile
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationAppError
from app.modules.collaboration import router, repository
from app.modules.collaboration.authorization import authorize_entity_access
from app.core.storage import file_storage_service


@pytest.mark.parametrize("entity_type", ["task", "project"])
def test_download_denies_nonmembers_before_reading_storage(entity_type):
    db, actor, attachment_id = AsyncMock(), SimpleNamespace(), uuid4()
    attachment = SimpleNamespace(entity_type=entity_type, entity_id=uuid4(), storage_key="private/document")
    with patch.object(repository, "get_file_attachment", AsyncMock(return_value=attachment)), patch("app.modules.collaboration.authorization.authorize_entity_access", AsyncMock(side_effect=ForbiddenError())), patch.object(file_storage_service, "download_async", AsyncMock()) as download:
        with pytest.raises(ForbiddenError):
            asyncio.run(router.download_file(attachment_id, actor, db))
        download.assert_not_awaited()


@pytest.mark.parametrize("entity_type", ["task", "project"])
def test_authorized_download_streams_private_attachment_with_filename(entity_type):
    db, actor, attachment_id = AsyncMock(), SimpleNamespace(), uuid4()
    attachment = SimpleNamespace(entity_type=entity_type, entity_id=uuid4(), storage_key="private/document", file_name="project guide.pdf")
    with patch.object(repository, "get_file_attachment", AsyncMock(return_value=attachment)), patch("app.modules.collaboration.authorization.authorize_entity_access", AsyncMock()) as authorize, patch.object(file_storage_service, "download_async", AsyncMock(return_value=b"document")):
        response = asyncio.run(router.download_file(attachment_id, actor, db))
    authorize.assert_awaited_once_with(db, actor, entity_type, attachment.entity_id)
    assert response.body == b"document"
    assert response.headers["cache-control"] == "private, no-store"
    assert "project%20guide.pdf" in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"


def test_missing_attachment_returns_not_found():
    with patch.object(repository, "get_file_attachment", AsyncMock(return_value=None)):
        with pytest.raises(NotFoundError):
            asyncio.run(router.download_file(uuid4(), SimpleNamespace(), AsyncMock()))


@pytest.mark.parametrize("filename,body", [("run.exe", b"invalid"), ("empty.pdf", b"")])
def test_invalid_documentation_is_rejected_before_storage(filename, body):
    with patch.object(router.service, "upload_file", AsyncMock()) as upload:
        with pytest.raises(ValidationAppError):
            asyncio.run(router.upload_file(entity_type="task", entity_id=uuid4(), file=UploadFile(filename=filename, file=io.BytesIO(body)), documentation=True, current_user=SimpleNamespace(), db=AsyncMock()))
        upload.assert_not_awaited()