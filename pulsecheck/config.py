"""Runtime settings, read from environment variables on every call.

Reading at call time (instead of import time) keeps the app stateless and lets
tests change limits with ``monkeypatch.setenv``. No secrets are ever stored here.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    allowed_hosts: tuple[str, ...]  # empty tuple => any public host
    allowed_ports: tuple[int, ...]
    max_response_bytes: int
    max_request_body_bytes: int
    max_redirects: int
    min_timeout: float
    max_timeout: float
    default_timeout: float
    rate_limit_per_minute: int


def get_settings() -> Settings:
    hosts = tuple(
        h.strip().lower()
        for h in os.environ.get("PULSECHECK_ALLOWED_HOSTS", "").split(",")
        if h.strip()
    )
    ports = tuple(
        int(p)
        for p in os.environ.get("PULSECHECK_ALLOWED_PORTS", "80,443,8080,8443").split(",")
        if p.strip().isdigit()
    )
    return Settings(
        allowed_hosts=hosts,
        allowed_ports=ports or (80, 443),
        max_response_bytes=_int("PULSECHECK_MAX_RESPONSE_BYTES", 1_000_000),
        max_request_body_bytes=_int("PULSECHECK_MAX_REQUEST_BODY_BYTES", 100_000),
        max_redirects=_int("PULSECHECK_MAX_REDIRECTS", 3),
        min_timeout=1.0,
        max_timeout=25.0,
        default_timeout=10.0,
        rate_limit_per_minute=_int("PULSECHECK_RATE_LIMIT_PER_MINUTE", 30),
    )
