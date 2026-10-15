import ipaddress

import pytest

from pulsecheck.errors import BlockedDestinationError, InvalidRequestError
from pulsecheck.security import is_blocked_ip, validate_destination
from .conftest import body


def run(coro):
    import asyncio

    return asyncio.run(coro)


@pytest.mark.parametrize(
    "ip",
    ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.0.1", "169.254.169.254", "0.0.0.0",
     "224.0.0.1", "240.0.0.1", "100.64.0.1", "::1", "fe80::1", "fc00::1", "ff02::1",
     "::ffff:127.0.0.1", "::ffff:10.0.0.1", "2002:7f00:1::1", "100.100.100.200"],
)
def test_blocked_ips(ip):
    assert is_blocked_ip(ipaddress.ip_address(ip))


@pytest.mark.parametrize("ip", ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"])
def test_public_ips_allowed(ip):
    assert not is_blocked_ip(ipaddress.ip_address(ip))


@pytest.mark.parametrize(
    "url",
    ["ftp://api.example.com/x", "file:///etc/passwd", "javascript:alert(1)", "//api.example.com",
     "not a url", "https://", "https://user:pw@api.example.com/", "https://api.example.com:22/"],
)
def test_invalid_or_unsupported_urls(url):
    with pytest.raises((InvalidRequestError, BlockedDestinationError)):
        run(validate_destination(url))


@pytest.mark.parametrize(
    "url",
    ["http://localhost/", "http://LOCALHOST:8080/", "http://foo.localhost/", "http://127.0.0.1/",
     "http://10.0.0.1/", "http://192.168.1.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
     "http://169.254.169.254/latest/meta-data/", "http://metadata.google.internal/",
     "http://service.internal/", "http://evil.example.com/", "http://loopback.example.com/",
     "http://metadata.example.com/", "http://mixed.example.com/"],
)
def test_ssrf_destinations_blocked(url):
    with pytest.raises(BlockedDestinationError):
        run(validate_destination(url))


def test_valid_destination_is_pinned_to_ip():
    dest = run(validate_destination("https://api.example.com/a/b?x=1"))
    assert dest.host == "api.example.com"
    assert dest.pinned_url == "https://93.184.216.34:443/a/b?x=1"
    assert dest.host_header == "api.example.com"


def test_ipv6_destination_pinned_with_brackets():
    dest = run(validate_destination("https://v6.example.com/"))
    assert dest.pinned_url.startswith("https://[2606:")


def test_allowlist_enforced(monkeypatch):
    monkeypatch.setenv("PULSECHECK_ALLOWED_HOSTS", "api.example.com")
    run(validate_destination("https://api.example.com/"))
    with pytest.raises(BlockedDestinationError):
        run(validate_destination("https://other.example.com/"))


def test_api_rejects_ssrf_with_400(client):
    for url in ("http://localhost/", "http://169.254.169.254/", "http://10.0.0.1/"):
        r = client.post("/api/request", json=body(url))
        assert r.status_code == 400, url
        assert r.json()["error"]["code"] == "blocked_destination"
