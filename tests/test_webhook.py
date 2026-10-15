import pytest


def test_valid_event_acknowledged(client):
    r = client.post("/api/webhook-test", json={"event_type": "order.created", "payload": {"id": 5, "tags": ["a"], "n": None}})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "acknowledged" and d["event_type"] == "order.created"
    assert d["event_id"].startswith("evt_") and d["received_at"].endswith("+00:00")
    s = d["payload_summary"]
    assert s["key_count"] == 3 and s["value_types"] == {"id": "number", "tags": "array", "n": "null"}


def test_client_event_id_is_kept(client):
    d = client.post("/api/webhook-test", json={"event_type": "ping", "event_id": "evt_abc"}).json()
    assert d["event_id"] == "evt_abc" and d["payload_summary"]["key_count"] == 0


@pytest.mark.parametrize(
    "payload",
    [{}, {"event_type": ""}, {"event_type": "bad type!"}, {"event_type": "x" * 65},
     {"event_type": "ok", "payload": "string"}, {"event_type": "ok", "payload": [1]},
     {"event_type": "ok", "extra": 1}, {"event_type": "ok", "payload": {"blob": "x" * 40_000}}],
)
def test_invalid_events_rejected(client, payload):
    r = client.post("/api/webhook-test", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_malformed_json_rejected(client):
    r = client.post("/api/webhook-test", content=b"{oops", headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_health(client):
    d = client.get("/api/health").json()
    assert d["status"] == "ok" and d["version"]
