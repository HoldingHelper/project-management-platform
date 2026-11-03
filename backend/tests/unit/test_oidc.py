from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from fastapi import HTTPException as ApiError
from app.core.config import Settings
from app.modules.identity import oidc


@pytest.fixture
def contract(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(
        oidc,
        "signing_keys",
        lambda _: SimpleNamespace(
            get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())
        ),
    )
    account = uuid4()
    settings = Settings(
        database_url="postgresql+asyncpg://test@localhost/test",
        oidc_issuer="https://identity.example.test/realms/dev",
        oidc_client_id="agtech-dev",
        oidc_subject_accounts={"assigned-subject": str(account)},
    )
    now = datetime.now(UTC)
    claims = dict(
        sub="assigned-subject",
        iss=settings.oidc_issuer,
        aud="agtech-dev",
        azp="agtech-dev",
        typ="Bearer",
        exp=now + timedelta(minutes=5),
        iat=now,
    )
    return key, account, settings, claims


def test_explicit_subject_maps_to_existing_account(contract):
    key, account, settings, claims = contract
    assert oidc.identity(jwt.encode(claims, key, algorithm="RS256"), settings) == account


@pytest.mark.parametrize(
    "override",
    [
        {"iss": "https://attacker.example.test"},
        {"aud": "other-app"},
        {"azp": "other-app"},
        {"typ": "ID"},
        {"exp": 1},
        {"sub": "unassigned"},
    ],
)
def test_invalid_identity_or_token_is_rejected(contract, override):
    key, _, settings, claims = contract
    claims.update(override)
    with pytest.raises(ApiError):
        oidc.identity(jwt.encode(claims, key, algorithm="RS256"), settings)


def test_forged_signature_is_rejected(contract):
    _, _, settings, claims = contract
    attacker = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(ApiError):
        oidc.identity(jwt.encode(claims, attacker, algorithm="RS256"), settings)
