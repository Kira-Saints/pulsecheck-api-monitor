import pytest

from pulsecheck.schemas import Expectation
from pulsecheck.validators import json_type, parse_path, validate_json

DOC = {
    "id": 7, "name": "Ada", "active": True, "score": 9.5, "tags": ["a", "b"],
    "profile": {"email": None, "address": {"city": "Paris"}},
    "items": [{"sku": "x1"}, {"sku": 2}],
}


def exp(path, type_):
    return Expectation(path=path, type=type_)


def test_json_type_distinguishes_bool_from_number():
    assert json_type(True) == "boolean" and json_type(1) == "number" and json_type(1.5) == "number"
    assert [json_type(v) for v in ("s", None, [], {})] == ["string", "null", "array", "object"]


def test_parse_path():
    assert parse_path("a.b[2].c") == ["a", "b", 2, "c"]
    assert parse_path("$.a") == ["a"] and parse_path("$") == []


def test_all_present_and_correct():
    res = validate_json(DOC, [exp("id", "number"), exp("name", "string"), exp("active", "boolean"),
                              exp("tags", "array"), exp("profile", "object"), exp("profile.email", "null"),
                              exp("profile.address.city", "string"), exp("items[0].sku", "string")])
    assert res.valid and res.passed == 8 and res.missing == 0 and res.mismatched == 0


def test_missing_fields():
    res = validate_json(DOC, [exp("nope", "string"), exp("profile.phone", "string"), exp("items[5].sku", "string")])
    assert not res.valid and res.missing == 3
    assert all(f.status == "missing" and f.actual is None for f in res.fields)


def test_type_mismatch_reports_actual_type():
    res = validate_json(DOC, [exp("id", "string"), exp("active", "number"), exp("items[1].sku", "string")])
    assert res.mismatched == 3 and not res.valid
    assert [f.actual for f in res.fields] == ["number", "boolean", "number"]


def test_null_value_counts_as_present():
    res = validate_json(DOC, [exp("profile.email", "null"), exp("profile.email", "string")])
    assert [f.status for f in res.fields] == ["ok", "type_mismatch"]


def test_root_array_and_scalar():
    assert validate_json([1, 2], [exp("$", "array"), exp("[0]", "number")]).valid
    assert validate_json("x", [exp("$", "string")]).valid


def test_api_endpoint(client):
    r = client.post("/api/validate-json", json={"data": DOC, "expectations": [{"path": "id", "type": "number"}]})
    assert r.status_code == 200 and r.json()["valid"] is True


@pytest.mark.parametrize(
    "payload",
    [{"data": {}, "expectations": []}, {"data": {}, "expectations": [{"path": "a", "type": "integer"}]},
     {"expectations": [{"path": "a", "type": "string"}]}],
)
def test_api_rejects_bad_input(client, payload):
    r = client.post("/api/validate-json", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_invalid_path_rejected(client):
    r = client.post("/api/validate-json", json={"data": {}, "expectations": [{"path": "a[x]", "type": "string"}]})
    assert r.status_code == 422
