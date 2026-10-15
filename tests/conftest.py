"""Shared fixtures. No test touches the real network or real DNS."""
from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from pulsecheck import executor, ratelimit, security
from pulsecheck.errors import InvalidRequestError
from pulsecheck.main import app

PUBLIC_IP = "93.184.216.34"
FAKE_DNS = {
    "api.example.com": [PUBLIC_IP],
    "other.example.com": ["93.184.216.35"],
    "evil.example.com": ["10.0.0.5"],
    "loopback.example.com": ["127.0.0.1"],
    "metadata.example.com": ["169.254.169.254"],
    "mixed.example.com": [PUBLIC_IP, "192.168.1.10"],
    "v6.example.com": ["2606:2800:220:1:248:1893:25c8:1946"],
}


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    ratelimit.reset()

    async def fake_resolve(host: str, port: int) -> list[str]:
        if host in FAKE_DNS:
            return FAKE_DNS[host]
        raise InvalidRequestError(f"Could not resolve host '{host}'.")

    monkeypatch.setattr(security, "resolve_host", fake_resolve)
    for var in (
        "PULSECHECK_ALLOWED_HOSTS", "PULSECHECK_MAX_RESPONSE_BYTES",
        "PULSECHECK_RATE_LIMIT_PER_MINUTE", "PULSECHECK_MAX_REDIRECTS",
    ):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def upstream(monkeypatch):
    """Install a fake upstream. Usage: ``seen = upstream(handler)``."""

    def install(handler):
        seen: list[httpx.Request] = []

        def wrapped(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return handler(request)

        monkeypatch.setattr(executor, "make_transport", lambda: httpx.MockTransport(wrapped))
        return seen

    return install


def body(url="https://api.example.com/items", method="GET", **extra):
    return {"method": method, "url": url, **extra}
