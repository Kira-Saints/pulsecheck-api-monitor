"""Validate a JSON document against a list of expected field paths and types."""
from __future__ import annotations

import re
from typing import Any

from .errors import InvalidRequestError
from .schemas import Expectation, FieldCheck, ValidateJsonResponse

_MISSING = object()
_TOKEN = re.compile(r"([^.\[\]]+)|\[(\d+)\]")


def json_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):  # bool is a subclass of int, check it first
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def parse_path(path: str) -> list[str | int]:
    """``data.items[0].id`` -> ['data', 'items', 0, 'id']; ``$`` / ``$.a`` roots allowed."""
    path = path.strip()
    if path.startswith("$"):
        path = path[1:].lstrip(".")
    if not path:
        return []
    tokens: list[str | int] = []
    pos = 0
    while pos < len(path):
        if path[pos] == ".":
            pos += 1
            continue
        m = _TOKEN.match(path, pos)
        if not m:
            raise InvalidRequestError(f"Invalid field path: {path!r}")
        tokens.append(m.group(1) if m.group(1) is not None else int(m.group(2)))
        pos = m.end()
    return tokens


def resolve(data: Any, tokens: list[str | int]) -> Any:
    cur = data
    for t in tokens:
        if isinstance(t, int):
            if isinstance(cur, list) and t < len(cur):
                cur = cur[t]
            else:
                return _MISSING
        else:
            if isinstance(cur, dict) and t in cur:
                cur = cur[t]
            else:
                return _MISSING
    return cur


def validate_json(data: Any, expectations: list[Expectation]) -> ValidateJsonResponse:
    fields: list[FieldCheck] = []
    for exp in expectations:
        value = resolve(data, parse_path(exp.path))
        if value is _MISSING:
            fields.append(FieldCheck(path=exp.path, expected=exp.type, actual=None, status="missing"))
            continue
        actual = json_type(value)
        fields.append(
            FieldCheck(
                path=exp.path,
                expected=exp.type,
                actual=actual,
                status="ok" if actual == exp.type else "type_mismatch",
            )
        )
    passed = sum(f.status == "ok" for f in fields)
    missing = sum(f.status == "missing" for f in fields)
    mismatched = sum(f.status == "type_mismatch" for f in fields)
    return ValidateJsonResponse(
        valid=passed == len(fields), passed=passed, missing=missing, mismatched=mismatched, fields=fields
    )
