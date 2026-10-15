import httpx
import pytest

from .conftest import body

SECRET = "sk_live_super_secret_123"


def ok_json(request):
    return httpx.Response(200, json={"id": 1, "name": "widget"})


@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
def test_supported_methods(client, upstream, method):
    seen = upstream(ok_json)
    extra = {} if method == "GET" else {"body": {"a": 1}}
    r = client.post("/api/request", json=body(method=method, **extra))
    assert r.status_code == 200, r.text
    assert seen[0].method == method


@pytest.mark.parametrize("method", ["TRACE", "CONNECT", "OPTIONS", "get", ""])
def test_unsupported_methods_rejected(client, method):
    r = client.post("/api/request", json=body(method=method))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_query_params_and_headers_forwarded(client, upstream):
    seen = upstream(ok_json)
    r = client.post(
        "/api/request",
        json=body(
            "https://api.example.com/items?existing=1",
            query=[{"key": "page", "value": "2"}, {"key": "q", "value": "a b"}],
            headers=[{"key": "X-Trace", "value": "abc"}],
        ),
    )
    assert r.status_code == 200
    req = seen[0]
    assert req.url.params["existing"] == "1" and req.url.params["page"] == "2"
    assert req.url.params["q"] == "a b"
    assert req.headers["x-trace"] == "abc"
    assert req.headers["host"] == "api.example.com"  # Host keeps the real name
    assert req.url.host == "93.184.216.34"  # connection pinned to validated IP


def test_json_body_sent(client, upstream):
    seen = upstream(ok_json)
    client.post("/api/request", json=body(method="POST", body={"name": "x", "n": [1, 2]}))
    assert seen[0].headers["content-type"] == "application/json"
    assert seen[0].content == b'{"name": "x", "n": [1, 2]}'


@pytest.mark.parametrize("status,ok", [(200, True), (201, True), (404, False), (500, False)])
def test_http_status_responses_are_returned_not_raised(client, upstream, status, ok):
    upstream(lambda r: httpx.Response(status, json={"status": status}))
    r = client.post("/api/request", json=body())
    assert r.status_code == 200
    data = r.json()
    assert data["status_code"] == status
    assert data["http_ok"] is ok
    assert data["is_json"] is True and data["body_json"] == {"status": status}
    assert data["reason"]
    assert isinstance(data["elapsed_ms"], int)


def test_plain_text_response(client, upstream):
    upstream(lambda r: httpx.Response(200, text="hello", headers={"content-type": "text/plain"}))
    data = client.post("/api/request", json=body()).json()
    assert data["is_json"] is False and data["body_text"] == "hello" and data["body_json"] is None


def test_invalid_json_response_is_reported(client, upstream):
    upstream(lambda r: httpx.Response(200, text="{not json", headers={"content-type": "application/json"}))
    data = client.post("/api/request", json=body()).json()
    assert data["is_json"] is False
    assert "not valid JSON" in data["json_error"]
    assert data["body_text"] == "{not json"


def test_timeout_returns_504(client, upstream):
    def boom(request):
        raise httpx.ReadTimeout("slow")

    upstream(boom)
    r = client.post("/api/request", json=body(timeout_seconds=2))
    assert r.status_code == 504
    assert r.json()["error"]["code"] == "timeout"


def test_connection_failure_returns_502(client, upstream):
    def boom(request):
        raise httpx.ConnectError("refused")

    upstream(boom)
    r = client.post("/api/request", json=body())
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "connection_failed"


@pytest.mark.parametrize("timeout", [0, 0.5, 26, 1000])
def test_timeout_bounds_enforced(client, timeout):
    assert client.post("/api/request", json=body(timeout_seconds=timeout)).status_code == 422


def test_oversized_response_truncated(client, upstream, monkeypatch):
    monkeypatch.setenv("PULSECHECK_MAX_RESPONSE_BYTES", "1000")
    upstream(lambda r: httpx.Response(200, content=b"x" * 5000, headers={"content-type": "text/plain"}))
    data = client.post("/api/request", json=body()).json()
    assert data["truncated"] is True
    assert data["size_bytes"] == 1000 and len(data["body_text"]) == 1000


def test_request_body_size_limit(client):
    r = client.post("/api/request", json=body(method="POST", body={"blob": "x" * 150_000}))
    assert r.status_code == 422


def test_get_with_body_rejected(client):
    assert client.post("/api/request", json=body(body={"a": 1})).status_code == 422


@pytest.mark.parametrize("name", ["Host", "Content-Length", "Proxy-Authorization", "X-Forwarded-For"])
def test_forbidden_headers_rejected(client, name):
    r = client.post("/api/request", json=body(headers=[{"key": name, "value": "x"}]))
    assert r.status_code == 422


def test_header_injection_rejected(client):
    r = client.post("/api/request", json=body(headers=[{"key": "X-A", "value": "a\r\nX-B: b"}]))
    assert r.status_code == 422


# ---- redirects -------------------------------------------------------------------

def test_redirect_to_private_host_is_blocked(client, upstream):
    seen = upstream(lambda r: httpx.Response(302, headers={"location": "http://evil.example.com/admin"}))
    r = client.post("/api/request", json=body())
    assert r.status_code == 400 and r.json()["error"]["code"] == "blocked_destination"
    assert len(seen) == 1  # the private destination was never contacted


def test_redirect_to_metadata_ip_literal_is_blocked(client, upstream):
    upstream(lambda r: httpx.Response(301, headers={"location": "http://169.254.169.254/latest/"}))
    assert client.post("/api/request", json=body()).status_code == 400


def test_safe_redirect_is_followed_and_recorded(client, upstream):
    def handler(request):
        if request.headers["host"] == "api.example.com":
            return httpx.Response(301, headers={"location": "https://other.example.com/final"})
        return httpx.Response(200, json={"ok": True})

    upstream(handler)
    data = client.post("/api/request", json=body()).json()
    assert data["status_code"] == 200
    assert data["redirects"][0]["to_url"] == "https://other.example.com/final"
    assert data["final_url"] == "https://other.example.com/final"


def test_redirect_loop_stops(client, upstream):
    upstream(lambda r: httpx.Response(302, headers={"location": "https://api.example.com/again"}))
    r = client.post("/api/request", json=body())
    assert r.status_code == 502 and r.json()["error"]["code"] == "too_many_redirects"


def test_post_303_becomes_get_without_body(client, upstream):
    def handler(request):
        if request.method == "POST":
            return httpx.Response(303, headers={"location": "/done"})
        return httpx.Response(200, json={})

    seen = upstream(handler)
    client.post("/api/request", json=body(method="POST", body={"a": 1}))
    assert seen[1].method == "GET" and seen[1].content == b""


def test_credentials_not_forwarded_across_origins(client, upstream):
    def handler(request):
        if request.headers["host"] == "api.example.com":
            return httpx.Response(302, headers={"location": "https://other.example.com/x"})
        return httpx.Response(200, json={})

    seen = upstream(handler)
    client.post("/api/request", json=body(auth={"type": "bearer", "token": SECRET}))
    assert "authorization" in seen[0].headers
    assert "authorization" not in seen[1].headers


# ---- authentication and redaction --------------------------------------------------

def test_bearer_auth_header_sent(client, upstream):
    seen = upstream(ok_json)
    client.post("/api/request", json=body(auth={"type": "bearer", "token": SECRET}))
    assert seen[0].headers["authorization"] == f"Bearer {SECRET}"


def test_api_key_in_header_and_query(client, upstream):
    seen = upstream(ok_json)
    client.post("/api/request", json=body(auth={"type": "api_key", "api_key_name": "X-Key", "api_key_value": SECRET}))
    assert seen[0].headers["x-key"] == SECRET
    client.post(
        "/api/request",
        json=body(auth={"type": "api_key", "api_key_name": "api_key", "api_key_value": SECRET, "api_key_location": "query"}),
    )
    assert seen[1].url.params["api_key"] == SECRET


def test_auth_validation(client):
    assert client.post("/api/request", json=body(auth={"type": "bearer"})).status_code == 422
    assert client.post("/api/request", json=body(auth={"type": "api_key"})).status_code == 422


def test_secrets_redacted_from_response(client, upstream):
    """Upstream echoes credentials back in body, headers and redirects; none may leak."""

    def echo(request):
        return httpx.Response(
            200,
            json={"you_sent": request.headers["authorization"], "url": str(request.url)},
            headers={"x-echo": f"token={SECRET}"},
        )

    upstream(echo)
    r = client.post(
        "/api/request",
        json=body("https://api.example.com/?api_key=" + SECRET, auth={"type": "bearer", "token": SECRET}),
    )
    assert SECRET not in r.text
    assert "[REDACTED]" in r.text


def test_secrets_redacted_from_errors(client, upstream):
    def boom(request):
        raise httpx.ConnectError(f"failed with Bearer {SECRET}")

    upstream(boom)
    r = client.post("/api/request", json=body(auth={"type": "bearer", "token": SECRET}))
    assert r.status_code == 502 and SECRET not in r.text


def test_query_api_key_redacted_in_final_url(client, upstream):
    upstream(ok_json)
    data = client.post(
        "/api/request",
        json=body(auth={"type": "api_key", "api_key_name": "api_key", "api_key_value": SECRET, "api_key_location": "query"}),
    ).json()
    assert SECRET not in data["final_url"] and "REDACTED" in data["final_url"]


def test_secrets_not_logged(client, upstream, caplog):
    upstream(ok_json)
    with caplog.at_level("DEBUG"):
        client.post("/api/request", json=body(auth={"type": "bearer", "token": SECRET}))
    assert SECRET not in caplog.text


# ---- abuse controls ---------------------------------------------------------------

def test_rate_limit(client, upstream, monkeypatch):
    monkeypatch.setenv("PULSECHECK_RATE_LIMIT_PER_MINUTE", "2")
    upstream(ok_json)
    codes = [client.post("/api/request", json=body()).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_oversized_http_body_rejected_early(client):
    r = client.post("/api/request", content=b"x" * 300_000, headers={"content-type": "application/json"})
    assert r.status_code == 413
