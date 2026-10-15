"""Domain errors that the route layer converts into consistent JSON responses."""
from __future__ import annotations


class PulseCheckError(Exception):
    """Base class. ``code`` is machine-readable, ``message`` is safe to show users."""

    code = "error"
    status_code = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidRequestError(PulseCheckError):
    code = "invalid_request"
    status_code = 422


class BlockedDestinationError(PulseCheckError):
    code = "blocked_destination"
    status_code = 400


class UpstreamTimeoutError(PulseCheckError):
    code = "timeout"
    status_code = 504


class UpstreamConnectionError(PulseCheckError):
    code = "connection_failed"
    status_code = 502


class RateLimitedError(PulseCheckError):
    code = "rate_limited"
    status_code = 429


class TooManyRedirectsError(PulseCheckError):
    code = "too_many_redirects"
    status_code = 502
