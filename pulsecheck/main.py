"""FastAPI application. Route handlers stay thin; logic lives in sibling modules."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import __version__
from .errors import PulseCheckError
from .executor import execute_request
from .ratelimit import rate_limit
from .schemas import (
    ApiRequest,
    ApiResult,
    ErrorResponse,
    HealthResponse,
    ValidateJsonRequest,
    ValidateJsonResponse,
    WebhookAck,
    WebhookEvent,
)
from .validators import validate_json
from .webhook import acknowledge

MAX_BODY_BYTES = 256_000  # hard cap on any incoming request body

app = FastAPI(
    title="PulseCheck API Monitor",
    version=__version__,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return _error(413, "payload_too_large", "Request body is too large.")
    return await call_next(request)


@app.exception_handler(PulseCheckError)
async def handle_domain_error(_: Request, exc: PulseCheckError):
    return _error(exc.status_code, exc.code, exc.message)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = str(first.get("msg", "Invalid request")).removeprefix("Value error, ")
    return _error(422, "validation_error", f"{loc}: {msg}" if loc else msg)


@app.exception_handler(Exception)
async def handle_unexpected(_: Request, exc: Exception):
    # Never leak internals (or credentials that may be in them).
    return _error(500, "internal_error", "Unexpected server error.")


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="pulsecheck-api-monitor",
        version=__version__,
        time=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )


_ERRORS = {"model": ErrorResponse}


@app.post(
    "/api/request",
    response_model=ApiResult,
    responses={400: _ERRORS, 422: _ERRORS, 429: _ERRORS, 502: _ERRORS, 504: _ERRORS},
    dependencies=[Depends(rate_limit)],
)
async def run_request(payload: ApiRequest) -> ApiResult:
    return await execute_request(payload)


@app.post("/api/validate-json", response_model=ValidateJsonResponse, responses={422: _ERRORS})
async def validate_json_route(payload: ValidateJsonRequest) -> ValidateJsonResponse:
    return validate_json(payload.data, payload.expectations)


@app.post(
    "/api/webhook-test",
    response_model=WebhookAck,
    responses={422: _ERRORS, 429: _ERRORS},
    dependencies=[Depends(rate_limit)],
)
async def webhook_test(event: WebhookEvent) -> WebhookAck:
    return acknowledge(event)
