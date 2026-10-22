"""
Makes every error reply look the same:

    {"error": {"code": "email_taken", "message": "...", "details": {...}}}

Routers raise AppError; add_error_handlers(app) turns it, and FastAPI's own errors,
into that shape.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger()


class AppError(Exception):
    """Raise this in a router to send an error, e.g. AppError(409, "email_taken", "...")."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def error_response(status, code, message, details=None):
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


def add_error_handlers(app: FastAPI):
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # FastAPI would send 422 with a list; we send 400 with {field: message}.
        details = {}
        for error in exc.errors():
            # ("body", "name") -> "name"; a field inside a list, ("body", "floors", 0, "name") -> "floors.0.name"
            loc = [str(part) for part in error["loc"]]
            field = ".".join(loc[1:]) if len(loc) > 1 else "body"
            details[field] = error["msg"].removeprefix("Value error, ")
        return error_response(400, "validation_error", "Please check the highlighted fields", details)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        # Not found is 400, because CloudFront replaces every 404 with the React page.
        if exc.status_code == 404:
            return error_response(400, "not_found", "Not found")
        return error_response(exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.exception("Unexpected error")
        return error_response(500, "server_error", "Something went wrong, please try again")
