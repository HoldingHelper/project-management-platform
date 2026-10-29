"""Product documentation uploads validate files and preserve membership boundaries."""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import ForbiddenError, ValidationAppError
from app.modules.projects import product_documentation as docs
from app.modules.projects import router


@pytest.mark.parametrize("filename", ["brief.pdf", "notes.DOCX", "readme.md", "guide.txt", "spec.odt"])
def test_supported_document_formats(filename):
    docs.validate_document(filename, b"documentation")


@pytest.mark.parametrize("filename,content", [("run.exe", b"data"), ("guide.pdf", b""), ("guide.pdf", b"x" * (docs.MAX_DOCUMENT_BYTES + 1))])
def test_invalid_document_uploads_are_rejected(filename, content):
    with pytest.raises(ValidationAppError):
        docs.validate_document(filename, content)


def test_document_reference_cannot_read_another_products_attachment():
    product_id = uuid4()
    attachment_id = uuid4()
    db = AsyncMock()
    db.get.side_effect = [SimpleNamespace(documentation_link=f"attachment:{attachment_id}"), SimpleNamespace(entity_type="product", entity_id=uuid4())]
    with pytest.raises(docs.NotFoundError):
        asyncio.run(docs.get_document(db, product_id))


def test_failed_database_save_cleans_storage_and_keeps_prior_reference_uncommitted():
    db = MagicMock()
    db.execute = AsyncMock()
    product = SimpleNamespace(documentation_link="https://example.com/old")
    result = MagicMock()
    result.scalar_one_or_none.return_value = product
    db.execute.return_value = result
    db.add.side_effect = lambda attachment: setattr(attachment, "id", uuid4())
    db.flush = AsyncMock()
    db.commit = AsyncMock(side_effect=RuntimeError("database save failed"))
    db.rollback = AsyncMock()
    with patch.object(docs.file_storage_service, "upload_async", AsyncMock()) as upload, patch.object(docs.file_storage_service, "delete", Mock()) as remove:
        with pytest.raises(RuntimeError):
            asyncio.run(docs.upload_document(db, uuid4(), SimpleNamespace(user_id=uuid4()), "guide.txt", "text/plain", b"guide"))
        upload.assert_awaited_once()
        db.rollback.assert_awaited_once()
        remove.assert_called_once()


@pytest.mark.parametrize("method,path", [("get", "/documentation"), ("get", "/documentation/download")])
def test_non_member_cannot_read_or_download_documentation(monkeypatch, method, path):
    app = FastAPI()
    app.include_router(router.products_router)
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test")
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    monkeypatch.setattr(router, "require_product_access", AsyncMock(side_effect=ForbiddenError()))
    with TestClient(app) as client, pytest.raises(ForbiddenError):
        getattr(client, method)(f"/products/{uuid4()}{path}")


@pytest.mark.parametrize("roles,permissions,allowed", [(["SuperAdmin"], [], True), (["CLevel"], ["products.update"], True), (["Developer"], [], False)])
def test_upload_requires_product_management(monkeypatch, roles, permissions, allowed):
    app = FastAPI()
    app.include_router(router.products_router)
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=roles, permissions=permissions)
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    product_id = uuid4()
    now = datetime.now(timezone.utc)
    attachment = SimpleNamespace(id=uuid4(), entity_id=product_id, entity_type="product", file_name="guide.txt", content_type="text/plain", size_bytes=5, uploaded_by_user_id=actor.user_id, version=1, created_at=now)
    upload = AsyncMock(return_value=attachment)
    monkeypatch.setattr(docs, "upload_document", upload)
    monkeypatch.setattr(router, "require_product_access", AsyncMock())
    with TestClient(app) as client:
        if allowed:
            response = client.post(f"/products/{product_id}/documentation", files={"file": ("guide.txt", b"guide", "text/plain")})
            assert response.status_code == 201
            assert response.json()["file_name"] == "guide.txt"
        else:
            with pytest.raises(ForbiddenError):
                client.post(f"/products/{product_id}/documentation", files={"file": ("guide.txt", b"guide", "text/plain")})
            upload.assert_not_awaited()
