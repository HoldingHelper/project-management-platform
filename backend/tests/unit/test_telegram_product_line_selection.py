"""Unit tests for single vs multi product line membership enforcement during project creation."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4
import pytest

from app.core.current_user import CurrentUser
from app.core.permissions import Permissions
from app.modules.telegram.wizard import ProjectWizard, get_user_member_products


@pytest.fixture
def test_user():
    return CurrentUser(
        user_id=uuid4(),
        email="developer@example.test",
        full_name="Farhad Zarei",
        roles=["Developer"],
        permissions=[
            Permissions.PROJECTS_CREATE,
            Permissions.PROJECTS_VIEW_ALL,
        ],
    )


@pytest.mark.asyncio
async def test_single_product_line_membership_skips_selection(test_user):
    """If user is a member of only 1 product line, auto-select it and skip selection."""
    db = AsyncMock()
    prod_single = SimpleNamespace(id=uuid4(), name="سامانه پرداخت", owner_user_id=test_user.user_id)

    with patch("app.modules.telegram.wizard.get_user_member_products", new_callable=AsyncMock) as mock_prods, \
         patch("app.modules.telegram.wizard.save_wizard_data", new_callable=AsyncMock) as mock_save, \
         patch("app.modules.projects.membership.product_people", new_callable=AsyncMock) as mock_people:
        mock_prods.return_value = [prod_single]
        mock_people.return_value = []

        text, markup = await ProjectWizard.start(db, test_user, chat_id=1001, lang="fa")

        # Step 1 (Product line selection) must be skipped! It should directly prompt for project manager:
        assert "مدیر پروژه" in text
        assert "سامانه پرداخت" in text
        # Verify saved wizard data automatically selected the product line
        mock_save.assert_awaited()
        saved_data = mock_save.call_args[0][1]
        assert saved_data["step"] == "project_manager"
        assert saved_data["data"]["product_id"] == str(prod_single.id)
        assert saved_data["data"]["product_name"] == prod_single.name


@pytest.mark.asyncio
async def test_multi_product_line_membership_forces_selection(test_user):
    """If user is a member of > 1 product lines, force them to choose."""
    db = AsyncMock()
    prod1 = SimpleNamespace(id=uuid4(), name="خط محصول A", owner_user_id=test_user.user_id)
    prod2 = SimpleNamespace(id=uuid4(), name="خط محصول B", owner_user_id=test_user.user_id)

    with patch("app.modules.telegram.wizard.get_user_member_products", new_callable=AsyncMock) as mock_prods, \
         patch("app.modules.telegram.wizard.save_wizard_data", new_callable=AsyncMock) as mock_save:
        mock_prods.return_value = [prod1, prod2]

        text, markup = await ProjectWizard.start(db, test_user, chat_id=1001, lang="fa")

        # Must display selection step
        assert "انتخاب خط محصول" in text
        assert "خط محصول هستید" in text

        # Verify buttons for both products exist
        callbacks = [
            btn.callback_data
            for row in markup.inline_keyboard
            for btn in row
            if btn.callback_data
        ]
        assert f"w:p:prod:{prod1.id.hex}" in callbacks
        assert f"w:p:prod:{prod2.id.hex}" in callbacks

        # Verify step is product_line and product_id is not set
        saved_data = mock_save.call_args[0][1]
        assert saved_data["step"] == "product_line"
        assert saved_data["data"].get("product_id") is None


@pytest.mark.asyncio
async def test_zero_product_line_membership_rejected(test_user):
    """If user is not a member of any product line, creation is blocked."""
    db = AsyncMock()

    with patch("app.modules.telegram.wizard.get_user_member_products", new_callable=AsyncMock) as mock_prods:
        mock_prods.return_value = []

        text, markup = await ProjectWizard.start(db, test_user, chat_id=1001, lang="fa")

        assert "شما عضو هیچ خط محصولی" in text
