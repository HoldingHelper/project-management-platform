"""Application-wide exception hierarchy.

Handlers raise these instead of returning ad-hoc error payloads; a single set
of FastAPI exception handlers (see `app.core.exception_handlers`) translates
them into consistent RFC7807-flavoured JSON responses. This mirrors the
"exception based" convention used across every module for predictability.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class AppException(Exception):
    """Base class for all expected application errors."""

    status_code: int = 500
    error_type: str = "internal_error"

    def __init__(
        self, message: str, *, details: Optional[Dict[str, Any]] = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(AppException):
    status_code = 404
    error_type = "not_found"

    def __init__(self, entity_name: str, key: Any) -> None:
        super().__init__(f"{entity_name} with id '{key}' was not found.")
        self.entity_name = entity_name
        self.key = key


class ValidationAppError(AppException):
    status_code = 400
    error_type = "validation_error"

    def __init__(
        self,
        message: str = "Validation failed.",
        *,
        errors: Optional[Dict[str, list]] = None,
    ) -> None:
        super().__init__(message, details={"errors": errors or {}})
        self.errors = errors or {}


class ForbiddenError(AppException):
    status_code = 403
    error_type = "forbidden"

    def __init__(
        self, message: str = "You do not have permission to perform this action."
    ) -> None:
        super().__init__(message)


class UnauthorizedError(AppException):
    status_code = 401
    error_type = "unauthorized"

    def __init__(
        self,
        message: str = "Authentication is required or the credentials are invalid.",
    ) -> None:
        super().__init__(message)


class ConflictError(AppException):
    status_code = 409
    error_type = "conflict"

    def __init__(self, message: str) -> None:
        super().__init__(message)


class BusinessRuleError(AppException):
    """Raised when a domain/business invariant is violated (e.g. a DAG cycle)."""

    status_code = 400
    error_type = "business_rule_violation"

    def __init__(self, message: str) -> None:
        super().__init__(message)
