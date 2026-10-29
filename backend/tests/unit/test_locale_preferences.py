import pytest
from pydantic import ValidationError
from app.modules.identity.schemas import UpdateProfileRequest


@pytest.mark.parametrize("locale", ["en", "fa"])
def test_supported_languages_can_be_saved_through_own_profile(locale):
    assert UpdateProfileRequest(locale=locale).locale == locale


@pytest.mark.parametrize("payload", [{"locale": "ar"}, {"locale": "FA"}, {"calendar": "unknown"}, {"numbering_system": "unknown"}])
def test_invalid_language_and_format_preferences_are_rejected(payload):
    with pytest.raises(ValidationError):
        UpdateProfileRequest(**payload)


def test_preference_update_does_not_accept_account_privileges():
    request = UpdateProfileRequest(locale="fa", roles=["SuperAdmin"])
    assert "roles" not in request.model_dump()


def test_display_preferences_can_be_changed_independently():
    assert UpdateProfileRequest(calendar="persian").model_dump(exclude_unset=True) == {"calendar": "persian"}
    assert UpdateProfileRequest(numbering_system="arabext").model_dump(exclude_unset=True) == {"numbering_system": "arabext"}
