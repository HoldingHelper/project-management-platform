"""Account-specific appearance settings; all database writes roll back."""
import os
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine
from app.modules.identity.models import User
from app.modules.identity import service
from app.modules.identity.schemas import UpdateUserSettingsRequest

@pytest.mark.parametrize("fields", [{"theme_variant":"unknown"},{"accent_color":"invalid"},{"theme":"invalid"}])
def test_appearance_choices_reject_unknown_values(fields):
    with pytest.raises(ValidationError):
        UpdateUserSettingsRequest(**fields)

@pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")
@pytest.mark.asyncio
async def test_appearance_persists_per_account_and_preserves_notifications():
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
                ids = list((await db.execute(select(User.id).where(User.is_active.is_(True)).limit(2))).scalars())
                assert len(ids) == 2
                await service.update_user_settings(db, ids[0], notification_prefs={"mentions":False}, theme="dark", theme_variant="study", accent_color="purple")
                await service.update_user_settings(db, ids[1], theme="light", theme_variant="minimal", accent_color="emerald")
                for variant in ("classic","frosted","clinical","sprint","study","minimal"):
                    await service.update_user_settings(db, ids[0], theme_variant=variant)
                    db.expire_all()
                    saved = await service.get_user_settings(db, ids[0])
                    assert saved.theme_variant == variant and saved.accent_color == "purple" and saved.theme == "dark"
                    assert saved.notification_prefs == {"mentions":False}
                for accent in ("blue","purple","emerald","teal","rose","amber"):
                    await service.update_user_settings(db, ids[0], accent_color=accent)
                    db.expire_all()
                    assert (await service.get_user_settings(db, ids[0])).accent_color == accent
                other = await service.get_user_settings(db, ids[1])
                assert other.theme_variant == "minimal" and other.accent_color == "emerald" and other.theme == "light"
        finally:
            await transaction.rollback()
    await engine.dispose()
