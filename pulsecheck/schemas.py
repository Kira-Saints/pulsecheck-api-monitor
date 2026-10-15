"""Pydantic request and response schemas."""
from __future__ import annotations

import json
import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

HEADER_NAME_RE = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$")
FORBIDDEN_HEADERS = {
    "host", "content-length", "transfer-encoding", "connection", "upgrade", "te",
    "trailer", "proxy-authorization", "proxy-connection", "keep-alive",
    "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "forwarded", "x-real-ip",
}
Method = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]


class KeyValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(min_length=1, max_length=200)
    value: str = Field(default="", max_length=4000)


class Auth(BaseModel):
    """Credentials are used for one outbound call and never stored or echoed."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["none", "bearer", "api_key"] = "none"
    token: Optional[str] = Field(default=None, max_length=4000, repr=False)
    api_key_name: str = Field(default="X-API-Key", max_length=100)
    api_key_value: Optional[str] = Field(default=None, max_length=4000, repr=False)
    api_key_location: Literal["header", "query"] = "header"

    @model_validator(mode="after")
    def _check(self) -> "Auth":
        if self.type == "bearer" and not (self.token or "").strip():
            raise ValueError("Bearer authentication requires a token.")
        if self.type == "api_key":
            if not (self.api_key_value or "").strip():
                raise ValueError("API-key authentication requires a value.")
            if not HEADER_NAME_RE.match(self.api_key_name):
                raise ValueError("API-key name contains invalid characters.")
        return self


class ApiRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: Method
    url: str = Field(min_length=1, max_length=2048)
    query: list[KeyValue] = Field(default_factory=list, max_length=20)
    headers: list[KeyValue] = Field(default_factory=list, max_length=20)
    body: Any = None
    auth: Auth = Field(default_factory=Auth)
    timeout_seconds: float = Field(default=10.0, ge=1, le=25)

    @field_validator("headers")
    @classmethod
    def _headers(cls, items: list[KeyValue]) -> list[KeyValue]:
        for h in items:
            name = h.key.strip()
            if not HEADER_NAME_RE.match(name):
                raise ValueError(f"Invalid header name: {name[:40]!r}")
            if name.lower() in FORBIDDEN_HEADERS or name.lower().startswith("proxy-"):
                raise ValueError(f"Header '{name}' is not allowed.")
            if "\r" in h.value or "\n" in h.value:
                raise ValueError("Header values cannot contain line breaks.")
        return items

    @model_validator(mode="after")
    def _body(self) -> "ApiRequest":
        if self.body is not None:
            if self.method == "GET":
                raise ValueError("GET requests cannot include a body.")
            if len(json.dumps(self.body, ensure_ascii=False).encode()) > 100_000:
                raise ValueError("Request body is larger than 100 KB.")
        return self


class ErrorInfo(BaseModel):
    code: str
    message: str


class RedirectHop(BaseModel):
    status_code: int
    from_url: str
    to_url: str


class ApiResult(BaseModel):
    http_ok: bool  # True only for a final 2xx status
    status_code: int
    reason: str
    elapsed_ms: int
    content_type: Optional[str]
    headers: dict[str, str]
    body_text: str
    body_json: Any = None
    is_json: bool
    json_error: Optional[str] = None
    truncated: bool
    size_bytes: int
    final_url: str
    redirects: list[RedirectHop] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorInfo


class Expectation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=1, max_length=300)
    type: Literal["string", "number", "boolean", "object", "array", "null"]


class ValidateJsonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: Any
    expectations: list[Expectation] = Field(min_length=1, max_length=100)


class FieldCheck(BaseModel):
    path: str
    expected: str
    actual: Optional[str]
    status: Literal["ok", "missing", "type_mismatch"]


class ValidateJsonResponse(BaseModel):
    valid: bool
    passed: int
    missing: int
    mismatched: int
    fields: list[FieldCheck]


class WebhookEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_type: str = Field(pattern=r"^[A-Za-z0-9_.:-]{1,64}$")
    event_id: Optional[str] = Field(default=None, pattern=r"^[A-Za-z0-9_.:-]{1,64}$")
    payload: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _size(self) -> "WebhookEvent":
        if len(json.dumps(self.payload, ensure_ascii=False).encode()) > 32_000:
            raise ValueError("Webhook payload is larger than 32 KB.")
        return self


class PayloadSummary(BaseModel):
    key_count: int
    keys: list[str]
    size_bytes: int
    value_types: dict[str, str]


class WebhookAck(BaseModel):
    status: Literal["acknowledged"]
    event_id: str
    event_type: str
    received_at: str
    payload_summary: PayloadSummary


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    time: str
