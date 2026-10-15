"""Helpers that keep credentials out of responses, logs and error messages."""
from __future__ import annotations

import re
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

REDACTED = "[REDACTED]"

SENSITIVE_HEADERS = {
    "authorization", "proxy-authorization", "x-api-key", "api-key", "apikey",
    "x-auth-token", "x-access-token", "x-token", "cookie", "set-cookie",
}
SENSITIVE_QUERY_KEYS = {
    "api_key", "apikey", "key", "token", "access_token", "auth", "authorization",
    "secret", "password", "client_secret", "signature", "sig",
}


def collect_secrets(values: Iterable[str | None]) -> list[str]:
    """Unique non-trivial secret strings, longest first (so substrings don't leak)."""
    out = {v.strip() for v in values if v and len(v.strip()) >= 3}
    return sorted(out, key=len, reverse=True)


def redact_text(text: str, secrets: Iterable[str]) -> str:
    for secret in secrets:
        text = text.replace(secret, REDACTED)
    return text


def redact_url(url: str, secrets: Iterable[str] = ()) -> str:
    """Mask sensitive query-parameter values and any known secret in a URL."""
    try:
        parts = urlsplit(url)
        pairs = [
            (k, REDACTED if k.lower() in SENSITIVE_QUERY_KEYS else v)
            for k, v in parse_qsl(parts.query, keep_blank_values=True)
        ]
        netloc = parts.netloc.rsplit("@", 1)[-1]  # drop any user:pass@
        url = urlunsplit((parts.scheme, netloc, parts.path, urlencode(pairs, safe="[]"), ""))
    except ValueError:
        pass
    return redact_text(url, secrets)


def redact_headers(headers: dict[str, str], secrets: Iterable[str] = ()) -> dict[str, str]:
    secrets = list(secrets)
    return {
        k: REDACTED if k.lower() in SENSITIVE_HEADERS else redact_text(v, secrets)
        for k, v in headers.items()
    }


_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+")


def scrub_message(message: str, secrets: Iterable[str] = ()) -> str:
    """Final safety net for error text: known secrets and bearer/basic tokens."""
    return _BEARER.sub(lambda m: f"{m.group(1)} {REDACTED}", redact_text(message, secrets))
