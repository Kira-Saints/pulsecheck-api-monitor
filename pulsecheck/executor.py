"""Executes a validated outbound request and turns the answer into an ApiResult.

Safety properties implemented here:
* every hop (including redirects) is validated by ``security.validate_destination``;
* the TCP connection is pinned to the validated IP (no DNS rebinding between
  check and connect) while ``Host`` and TLS SNI keep the original hostname;
* redirects are followed manually, up to a small limit;
* response bodies are streamed and cut off at ``max_response_bytes``;
* credentials are redacted from everything that leaves this module.
"""
from __future__ import annotations

import asyncio
import http
import json
import logging
import time
from typing import Any, Optional
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit

import httpx

from .config import get_settings
from .errors import (
    PulseCheckError,
    TooManyRedirectsError,
    UpstreamConnectionError,
    UpstreamTimeoutError,
)
from .redaction import collect_secrets, redact_headers, redact_text, redact_url, scrub_message
from .schemas import ApiRequest, ApiResult, RedirectHop
from .security import validate_destination

logger = logging.getLogger("pulsecheck")
REDIRECT_CODES = {301, 302, 303, 307, 308}


def make_transport() -> Optional[httpx.AsyncBaseTransport]:
    """Return a custom transport. ``None`` means real network. Tests override this."""
    return None


def build_url(req: ApiRequest) -> str:
    parts = urlsplit(req.url.strip())
    extra = [(q.key, q.value) for q in req.query]
    if req.auth.type == "api_key" and req.auth.api_key_location == "query":
        extra.append((req.auth.api_key_name, req.auth.api_key_value or ""))
    query = "&".join(p for p in (parts.query, urlencode(extra)) if p)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


def build_headers(req: ApiRequest) -> dict[str, str]:
    headers: dict[str, str] = {
        "User-Agent": "PulseCheck-API-Monitor/1.0",
        "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
    }
    for h in req.headers:
        headers[h.key.strip()] = h.value
    if req.body is not None and not any(k.lower() == "content-type" for k in headers):
        headers["Content-Type"] = "application/json"
    if req.auth.type == "bearer":
        headers["Authorization"] = f"Bearer {req.auth.token.strip()}"  # type: ignore[union-attr]
    elif req.auth.type == "api_key" and req.auth.api_key_location == "header":
        headers[req.auth.api_key_name] = req.auth.api_key_value or ""
    return headers


def _origin(url: str) -> tuple[str, str, int]:
    p = urlsplit(url)
    return (p.scheme, (p.hostname or "").lower(), p.port or (443 if p.scheme == "https" else 80))


def _secret_values(req: ApiRequest) -> list[str]:
    vals: list[str | None] = [req.auth.token, req.auth.api_key_value]
    from .redaction import SENSITIVE_HEADERS

    vals += [h.value for h in req.headers if h.key.lower() in SENSITIVE_HEADERS]
    return collect_secrets(vals)


async def _read_limited(resp: httpx.Response, limit: int) -> tuple[bytes, bool]:
    chunks: list[bytes] = []
    total = 0
    async for chunk in resp.aiter_bytes():
        room = limit - total
        if len(chunk) > room:
            chunks.append(chunk[:room])
            return b"".join(chunks), True
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks), False


def _decode(raw: bytes, content_type: str | None) -> str:
    charset = "utf-8"
    if content_type and "charset=" in content_type.lower():
        charset = content_type.lower().split("charset=")[1].split(";")[0].strip(" \"'") or "utf-8"
    try:
        return raw.decode(charset, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def _parse_json(text: str, content_type: str | None) -> tuple[bool, Any, Optional[str]]:
    looks_json = "json" in (content_type or "").lower() or text.lstrip()[:1] in ("{", "[")
    if not looks_json or not text.strip():
        return False, None, None
    try:
        return True, json.loads(text), None
    except ValueError as exc:
        return False, None, f"Response is not valid JSON ({exc.__class__.__name__}: {str(exc)[:120]})"


async def execute_request(req: ApiRequest) -> ApiResult:
    settings = get_settings()
    secrets = _secret_values(req)
    url = build_url(req)
    method = req.method
    headers = build_headers(req)
    body: Optional[bytes] = (
        json.dumps(req.body, ensure_ascii=False).encode() if req.body is not None else None
    )
    redirects: list[RedirectHop] = []
    started = time.perf_counter()
    timeout = max(settings.min_timeout, min(req.timeout_seconds, settings.max_timeout))

    try:
        async with asyncio.timeout(timeout):
            async with httpx.AsyncClient(
                transport=make_transport(),
                timeout=httpx.Timeout(timeout),
                follow_redirects=False,
                trust_env=False,  # never honour proxy environment variables
            ) as client:
                for _hop in range(settings.max_redirects + 1):
                    dest = await validate_destination(url)
                    send_headers = dict(headers)
                    send_headers["Host"] = dest.host_header
                    request = client.build_request(
                        method,
                        dest.pinned_url,
                        headers=send_headers,
                        content=body,
                        extensions={"sni_hostname": dest.host},
                    )
                    resp = await client.send(request, stream=True)
                    try:
                        location = resp.headers.get("location")
                        if resp.status_code in REDIRECT_CODES and location:
                            next_url = urljoin(url, location)
                            redirects.append(
                                RedirectHop(
                                    status_code=resp.status_code,
                                    from_url=redact_url(url, secrets),
                                    to_url=redact_url(next_url, secrets),
                                )
                            )
                            if resp.status_code in (301, 302, 303) and method != "GET":
                                method, body = "GET", None
                                headers = {
                                    k: v for k, v in headers.items()
                                    if k.lower() not in ("content-type", "content-length")
                                }
                            if _origin(next_url) != _origin(url):
                                # Never forward credentials to a different origin.
                                headers = {
                                    k: v for k, v in headers.items()
                                    if k.lower() not in _auth_header_names(req)
                                }
                            url = next_url
                            continue
                        raw, truncated = await _read_limited(resp, settings.max_response_bytes)
                        elapsed = int((time.perf_counter() - started) * 1000)
                        return _build_result(resp, raw, truncated, elapsed, url, redirects, secrets)
                    finally:
                        await resp.aclose()
                raise TooManyRedirectsError(
                    f"Stopped after {settings.max_redirects} redirects."
                )
    except PulseCheckError as exc:
        exc.message = scrub_message(exc.message, secrets)
        raise
    except (asyncio.TimeoutError, httpx.TimeoutException) as exc:
        raise UpstreamTimeoutError(f"The request timed out after {timeout:g} seconds.") from exc
    except httpx.TooManyRedirects as exc:  # pragma: no cover - we follow manually
        raise TooManyRedirectsError("Too many redirects.") from exc
    except httpx.ConnectError as exc:
        text = str(exc).lower()
        msg = "TLS/SSL handshake failed." if "ssl" in text or "certificate" in text else (
            "Could not connect to the host."
        )
        raise UpstreamConnectionError(msg) from exc
    except httpx.HTTPError as exc:
        raise UpstreamConnectionError(
            scrub_message(f"The connection failed ({exc.__class__.__name__}).", secrets)
        ) from exc
    except OSError as exc:
        raise UpstreamConnectionError("The connection failed.") from exc


def _auth_header_names(req: ApiRequest) -> set[str]:
    from .redaction import SENSITIVE_HEADERS

    names = set(SENSITIVE_HEADERS) | {"authorization"}
    if req.auth.type == "api_key":
        names.add(req.auth.api_key_name.lower())
    return names


def _build_result(
    resp: httpx.Response,
    raw: bytes,
    truncated: bool,
    elapsed_ms: int,
    final_url: str,
    redirects: list[RedirectHop],
    secrets: list[str],
) -> ApiResult:
    content_type = resp.headers.get("content-type")
    text = redact_text(_decode(raw, content_type), secrets)
    # A truncated body is rarely valid JSON; report that instead of a parse error.
    if truncated:
        is_json, parsed, json_err = False, None, "Response was truncated at the size limit."
    else:
        is_json, parsed, json_err = _parse_json(text, content_type)
    try:
        reason = http.HTTPStatus(resp.status_code).phrase
    except ValueError:
        reason = resp.reason_phrase or "Unknown"
    headers: dict[str, str] = {}
    for k, v in resp.headers.multi_items():
        headers[k] = f"{headers[k]}, {v}" if k in headers else v
    result = ApiResult(
        http_ok=200 <= resp.status_code < 300,
        status_code=resp.status_code,
        reason=reason,
        elapsed_ms=elapsed_ms,
        content_type=content_type,
        headers=redact_headers(headers, secrets),
        body_text=text,
        body_json=parsed,
        is_json=is_json,
        json_error=json_err,
        truncated=truncated,
        size_bytes=len(raw),
        final_url=redact_url(final_url, secrets),
        redirects=redirects,
    )
    logger.info("outbound status=%s ms=%s host=%s", resp.status_code, elapsed_ms, urlsplit(final_url).hostname)
    return result
