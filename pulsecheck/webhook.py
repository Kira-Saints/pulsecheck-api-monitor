"""Webhook demonstration logic: acknowledge an event and summarise its payload."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .schemas import PayloadSummary, WebhookAck, WebhookEvent
from .validators import json_type


def acknowledge(event: WebhookEvent) -> WebhookAck:
    keys = list(event.payload.keys())
    return WebhookAck(
        status="acknowledged",
        event_id=event.event_id or f"evt_{uuid.uuid4().hex[:16]}",
        event_type=event.event_type,
        received_at=datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        payload_summary=PayloadSummary(
            key_count=len(keys),
            keys=keys[:25],
            size_bytes=len(json.dumps(event.payload, ensure_ascii=False).encode()),
            value_types={k: json_type(v) for k, v in list(event.payload.items())[:25]},
        ),
    )
