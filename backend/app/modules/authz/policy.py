"""Load and evaluate the reviewable authorization policy."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Any


@lru_cache(maxsize=1)
def load_policy() -> dict[str, Any]:
    raw = files("app.modules.authz").joinpath("policy.yaml").read_text(encoding="utf-8")
    return json.loads(raw)


def role_allows(role: str, object_type: str, action: str) -> bool:
    rules = load_policy().get("roles", {}).get(role, {})
    if rules.get("*") == "*":
        return True
    allowed = rules.get(object_type, [])
    return allowed == "*" or action in allowed


def valid_role(role: str) -> bool:
    return role in load_policy().get("roles", {})


def privileged_role(role: str) -> bool:
    return role in load_policy().get("privileged_roles", [])
