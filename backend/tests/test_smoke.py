"""Boot-level smoke tests: the app composes, routes register, health works.

These run without Postgres/Redis/MinIO (the lifespan tolerates missing infra),
so they are safe in any CI environment.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest


def test_app_imports_and_routes_register():
    from app.main import app

    # Wave-1 refactor level: identity+invitations, projects+milestones+
    # portfolio, chat, notifications, analytics, search.
    # FastAPI 0.141+ stores included routers as compact route groups. The
    # generated OpenAPI paths remain the stable public registration boundary.
    assert len(app.openapi()["paths"]) >= 110


def test_health_and_auth_guards():
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        # Protected routes reject anonymous access.
        assert client.get("/api/v1/users/me").status_code == 401
        assert client.get("/api/v1/chat/channels").status_code == 401
        assert client.get("/api/v1/analytics/velocity").status_code == 401


def test_permission_catalog_is_consistent():
    from app.core.permissions import ALL_ROLES, ROLE_PERMISSIONS, Permissions

    all_codes = set(Permissions.all())
    assert "chat.access" in all_codes
    assert "users.invite" in all_codes
    assert "CLevel" in ALL_ROLES
    for role, codes in ROLE_PERMISSIONS.items():
        assert role in ALL_ROLES
        assert set(codes) <= all_codes, f"unknown permission in {role}"


def test_production_config_rejects_unsafe_defaults():
    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(environment="production")

    settings = Settings(
        environment="production",
        debug=False,
        jwt_secret="x" * 48,
        database_url="postgresql+asyncpg://pmp_app:strong_password@db/projectplatform",
        s3_access_key="pmp_prod_access",
        s3_secret_key="pmp_prod_secret",
        seed_admin_password="a-production-only-admin-password",
    )
    assert settings.is_production


@pytest.mark.asyncio
async def test_collaboration_authorization_fails_closed_for_unknown_entity():
    from app.core.current_user import CurrentUser
    from app.core.exceptions import ForbiddenError
    from app.modules.collaboration.authorization import authorize_entity_access

    user = CurrentUser(user_id=uuid4(), email="a@example.com", full_name="A")

    with pytest.raises(ForbiddenError):
        await authorize_entity_access(None, user, "unknown", uuid4())  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_notification_reply_upload_authorizes_only_owner():
    from app.core.current_user import CurrentUser
    from app.core.exceptions import NotFoundError
    from app.modules.collaboration.authorization import authorize_entity_access
    from app.modules.collaboration.models import Notification

    owner_id = uuid4()
    other_id = uuid4()
    notification_id = uuid4()
    notification = Notification(
        id=notification_id,
        user_id=owner_id,
        type="mention",
        title="Mention",
        body="Body",
    )

    class FakeDb:
        async def get(self, model, key):
            if model is Notification and key == notification_id:
                return notification
            return None

    owner = CurrentUser(user_id=owner_id, email="owner@example.com", full_name="Owner")
    other = CurrentUser(user_id=other_id, email="other@example.com", full_name="Other")

    await authorize_entity_access(FakeDb(), owner, "notification_reply", notification_id)  # type: ignore[arg-type]
    with pytest.raises(NotFoundError):
        await authorize_entity_access(FakeDb(), other, "notification_reply", notification_id)  # type: ignore[arg-type]
