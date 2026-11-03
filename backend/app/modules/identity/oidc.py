"""Validate only the configured issuer and explicitly assigned identities."""
from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import HTTPException


@lru_cache(maxsize=4)
def signing_keys(issuer):
    return jwt.PyJWKClient(issuer.rstrip('/')+'/protocol/openid-connect/certs', timeout=5)


def identity(token, config):
    if not config.oidc_issuer:
        raise HTTPException(503, 'Single sign-on is unavailable')
    try:
        key = signing_keys(config.oidc_issuer).get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=['RS256'], audience=config.oidc_client_id,
                            issuer=config.oidc_issuer, options={'require':['exp','iat','sub','iss','aud']})
        if claims.get('azp') != config.oidc_client_id or claims.get('typ') != 'Bearer':
            raise jwt.InvalidTokenError()
    except jwt.PyJWTError:
        raise HTTPException(401, 'Invalid single sign-on token') from None
    account = config.oidc_subject_accounts.get(claims['sub'])
    if not account:
        raise HTTPException(403, 'Identity is not assigned to an account')
    return UUID(account)
