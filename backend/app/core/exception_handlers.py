"""Registers global exception handlers on the FastAPI app instance."""

from __future__ import annotations

import uuid

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

from app.core.exceptions import AppException

logger = structlog.get_logger(__name__)


def _problem(
    request: Request, status_code: int, error_type: str, message: str, details=None
) -> JSONResponse:
    correlation_id = getattr(request.state, "correlation_id", str(uuid.uuid4()))
    return JSONResponse(
        status_code=status_code,
        content={
            "type": error_type,
            "title": message,
            "status": status_code,
            "correlationId": correlation_id,
            "details": details or {},
        },
        headers={"X-Correlation-Id": correlation_id},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException) -> JSONResponse:
        return _problem(
            request, exc.status_code, exc.error_type, exc.message, exc.details
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors: dict[str, list] = {}
        for err in exc.errors():
            field = ".".join(str(loc) for loc in err["loc"] if loc != "body")
            errors.setdefault(field or "__root__", []).append(err["msg"])
        return _problem(
            request,
            status.HTTP_400_BAD_REQUEST,
            "validation_error",
            "Validation failed.",
            {"errors": errors},
        )

    @app.exception_handler(DBAPIError)
    async def handle_db_error(request: Request, exc: DBAPIError) -> JSONResponse:
        # The Postgres DAG cycle-detection trigger raises a plain SQL exception
        # (SQLSTATE P0001) which surfaces here as a DBAPIError. Translate it into
        # a friendly 400 instead of leaking a raw database stack trace.
        orig_message = str(getattr(exc, "orig", exc))
        if (
            "Cycle detected" in orig_message
            or "cannot depend on itself" in orig_message
        ):
            message = orig_message.split("\n")[0]
            logger.warning("dag_cycle_rejected", detail=message)
            return _problem(
                request, status.HTTP_400_BAD_REQUEST, "business_rule_violation", message
            )
        logger.error("database_error", error=orig_message)
        return _problem(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "internal_error",
            "A database error occurred.",
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        correlation_id = getattr(request.state, "correlation_id", str(uuid.uuid4()))
        logger.error(
            "unhandled_exception",
            error=str(exc),
            correlation_id=correlation_id,
            exc_info=exc,
        )
        return _problem(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "internal_error",
            "An unexpected error occurred.",
        )
