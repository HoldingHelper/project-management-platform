"""Rollback-only platform language defaults and role restrictions."""
import os
from uuid import uuid4
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.projects import models as projects_models  # Register referenced task tables.
from app.modules.org import models as org_models
from app.modules.identity import service
from app.modules.identity.models import PlatformLanguage, User

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")

@pytest.mark.asyncio
async def test_platform_language_default_permissions_and_persistence():
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
                admin = CurrentUser(uuid4(), "admin@example.com", "Admin", ["SuperAdmin"])
                regular = CurrentUser(uuid4(), "regular@example.com", "Regular", ["CompanyManager"], ["system.manage_settings"])
                token = CurrentUser(admin.user_id, admin.email, admin.full_name, ["SuperAdmin"], ["system.manage_settings"], allow_role_bypass=False)
                for actor in (regular, token):
                    with pytest.raises(ForbiddenError):
                        await service.set_platform_language(db, actor, "fa")
                for locale in ("fa", "en"):
                    result = await service.set_platform_language(db, admin, locale)
                    assert result == {"locale": locale, "configured": True}
                    db.expire_all()
                    assert await service.get_platform_language(db) == result
                # Resetting a personal choice must persist NULL (inherit), not
                # copy the current platform default into the user record.
                user_id = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                assert (await service.update_profile(db, user_id, locale="fa")).locale == "fa"
                assert (await service.update_profile(db, user_id, locale=None)).locale is None
                setting = await db.get(PlatformLanguage, "default")
                setting.locale = None
                await db.flush()
                assert await service.get_platform_language(db) == {"locale": "en", "configured": False}
        finally:
            await transaction.rollback()
    await engine.dispose()
