"""Best-effort sliding-window rate limiter.

Vercel runs functions on short-lived instances that do not share memory, so this
limit is per instance and resets on cold starts. It slows down casual abuse of a
public demo; it is NOT a global quota. See README for stronger options.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request

from .config import get_settings
from .errors import RateLimitedError

_hits: dict[str, deque[float]] = defaultdict(deque)
WINDOW = 60.0


def reset() -> None:
    _hits.clear()


def client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request) -> None:
    limit = get_settings().rate_limit_per_minute
    if limit <= 0:
        return
    now = time.monotonic()
    if len(_hits) > 5000:  # bound memory
        _hits.clear()
    q = _hits[client_key(request)]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= limit:
        raise RateLimitedError(f"Rate limit reached ({limit} requests per minute). Try again shortly.")
    q.append(now)
