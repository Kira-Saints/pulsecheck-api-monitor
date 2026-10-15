"""SSRF protection: URL parsing, DNS resolution and destination-IP validation."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

from .config import get_settings
from .errors import BlockedDestinationError, InvalidRequestError

BLOCKED_HOSTNAMES = {
    "localhost", "metadata", "metadata.google.internal", "metadata.goog",
    "instance-data", "instance-data.ec2.internal", "kubernetes.default.svc",
}
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan")
# Cloud metadata addresses (also caught by is_global, listed explicitly for clarity).
METADATA_IPS = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("169.254.170.2"),
    ipaddress.ip_address("100.100.100.200"),  # Alibaba
    ipaddress.ip_address("fd00:ec2::254"),  # AWS IPv6
}


@dataclass(frozen=True)
class Destination:
    scheme: str
    host: str  # original hostname (for Host header and TLS SNI)
    port: int
    ip: str  # validated address that the connection is pinned to
    path_and_query: str

    @property
    def host_header(self) -> str:
        default = 443 if self.scheme == "https" else 80
        host = f"[{self.host}]" if ":" in self.host else self.host
        return host if self.port == default else f"{host}:{self.port}"

    @property
    def pinned_url(self) -> str:
        ip = f"[{self.ip}]" if ":" in self.ip else self.ip
        return f"{self.scheme}://{ip}:{self.port}{self.path_and_query}"


def is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Only globally routable unicast addresses are allowed."""
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return is_blocked_ip(ip.ipv4_mapped)
        if ip.sixtofour is not None and is_blocked_ip(ip.sixtofour):
            return True
        if ip.teredo is not None:
            return True
    if ip in METADATA_IPS:
        return True
    return (
        not ip.is_global
        or ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def resolve_host(host: str, port: int) -> list[str]:
    """Resolve a hostname to IP strings. Tests replace this function."""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise InvalidRequestError(f"Could not resolve host '{host}'.") from exc
    seen: list[str] = []
    for info in infos:
        addr = info[4][0]
        if addr not in seen:
            seen.append(addr)
    return seen


def _host_allowed(host: str, allowed: tuple[str, ...]) -> bool:
    return not allowed or any(host == a or host.endswith("." + a) for a in allowed)


async def validate_destination(url: str) -> Destination:
    """Validate ``url`` and return a destination pinned to a safe IP address.

    Called for the initial URL and again for every redirect hop.
    """
    settings = get_settings()
    try:
        parts = urlsplit(url.strip())
        port = parts.port
        host = (parts.hostname or "").lower().rstrip(".")
    except ValueError as exc:
        raise InvalidRequestError("The URL is not valid.") from exc

    if parts.scheme not in ("http", "https"):
        raise InvalidRequestError("Only http:// and https:// URLs are supported.")
    if not host:
        raise InvalidRequestError("The URL must include a host name.")
    if parts.username or parts.password:
        raise InvalidRequestError("URLs with embedded credentials are not allowed.")
    if any(ord(c) < 33 or ord(c) == 127 for c in url):
        raise InvalidRequestError("The URL contains spaces or control characters.")
    port = port or (443 if parts.scheme == "https" else 80)
    if port not in settings.allowed_ports:
        raise BlockedDestinationError(f"Port {port} is not permitted.")

    if host in BLOCKED_HOSTNAMES or host.endswith(BLOCKED_SUFFIXES):
        raise BlockedDestinationError("This host name is not permitted.")

    literal: ipaddress.IPv4Address | ipaddress.IPv6Address | None
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise InvalidRequestError("The host name is not valid.") from exc

    if not _host_allowed(host, settings.allowed_hosts):
        raise BlockedDestinationError(
            "This host is not on the server's allowlist (PULSECHECK_ALLOWED_HOSTS)."
        )

    if literal is not None:
        ips = [str(literal)]
    else:
        ips = await resolve_host(host, port)
    if not ips:
        raise InvalidRequestError(f"Could not resolve host '{host}'.")

    # Every resolved address must be public; a mixed answer is rejected outright.
    for raw in ips:
        if is_blocked_ip(ipaddress.ip_address(raw)):
            raise BlockedDestinationError(
                "The destination resolves to a private, loopback, link-local, "
                "reserved or metadata address and is blocked."
            )

    path = parts.path or "/"
    pq = path + (f"?{parts.query}" if parts.query else "")
    return Destination(parts.scheme, host, port, ips[0], pq)
