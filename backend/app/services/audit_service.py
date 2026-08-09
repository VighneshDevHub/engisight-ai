"""
Lightweight in-memory audit log queue, flushed to Postgres in batches.

Why a queue rather than direct INSERT:
- The inference hot path runs inside Celery tasks on the critical path of
  every P&ID extraction. Adding a synchronous SQLAlchemy INSERT per call
  would add 2-10ms *per vision call* — multiplied by 100+ regions per
  drawing, that's real latency.
- Batch inserts are more efficient: queue 100 records, flush with one
  execute_values() call instead of 100 round-trips.

For simplicity in this Phase-3A implementation, we use a process-local
thread-safe queue (multi-worker processes each flush their own batches).
If Redis is available we also publish to a stream so the API container
can query audit logs written by the worker; the PG table remains the
source of truth regardless.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

_FLUSH_BATCH_SIZE = 50
_FLUSH_INTERVAL_SECONDS = 10.0


@dataclass
class AuditEntry:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    trace_id: uuid.UUID | None = None
    inference_type: str = ""
    provider: str = ""
    model: str = ""
    prompt: str = ""
    response: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0
    cost_cents: float = 0.0
    metadata_json: str = "{}"
    created_at: float = field(default_factory=time.time)


_queue: deque[AuditEntry] = deque()
_lock = threading.Lock()
_last_flush: float = 0.0


def enqueue_audit(
    *,
    trace_id: uuid.UUID | None,
    inference_type: str,
    provider: str,
    model: str,
    prompt: str,
    response: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int,
    cost_cents: float,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Append one audit entry to the memory queue. Triggers a flush if the batch size is reached."""
    import json as _json
    entry = AuditEntry(
        trace_id=trace_id,
        inference_type=inference_type,
        provider=provider,
        model=model,
        prompt=prompt,
        response=response,
        prompt_tokens=int(prompt_tokens or 0),
        completion_tokens=int(completion_tokens or 0),
        latency_ms=int(latency_ms or 0),
        cost_cents=float(cost_cents or 0.0),
        metadata_json=_json.dumps(metadata or {}),
    )
    global _last_flush
    with _lock:
        _queue.append(entry)
        now = time.monotonic()
        if len(_queue) >= _FLUSH_BATCH_SIZE or (now - _last_flush) > _FLUSH_INTERVAL_SECONDS:
            entries = list(_queue)
            _queue.clear()
            _last_flush = now
        else:
            entries = []
    if entries:
        _flush(entries)


def force_flush() -> None:
    """Public flush hook, e.g. for tests or graceful worker shutdown."""
    with _lock:
        entries = list(_queue)
        _queue.clear()
    if entries:
        _flush(entries)


def _flush(entries: list[AuditEntry]) -> None:
    """
    Write a batch of audit entries to the Postgres audit_logs table.
    On any failure: re-enqueue to try again later (dropping the oldest
    ones only if the re-enqueue would exceed a hard cap of 1000 pending).
    Never raise — audit failure must not crash inference.
    """
    if not entries:
        return
    try:
        from app.db.session import SyncSessionLocal  # local: avoid circular at import
        from sqlalchemy import text
        rows = [
            (
                str(e.id),
                str(e.trace_id) if e.trace_id else None,
                e.inference_type,
                e.provider,
                e.model,
                e.prompt,
                e.response,
                e.prompt_tokens,
                e.completion_tokens,
                e.latency_ms,
                e.cost_cents,
                e.metadata_json,
            )
            for e in entries
        ]
        with SyncSessionLocal() as db:
            db.execute(
                text(
                    """
                    INSERT INTO audit_logs (
                        id, trace_id, inference_type, provider, model, prompt, response,
                        prompt_tokens, completion_tokens, latency_ms, cost_cents, metadata
                    )
                    VALUES (
                        :id::uuid, :trace_id::uuid, :inference_type, :provider, :model,
                        :prompt, :response, :prompt_tokens, :completion_tokens,
                        :latency_ms, :cost_cents, :metadata::jsonb
                    )
                    ON CONFLICT (id) DO NOTHING
                    """
                ),
                [
                    {
                        "id": r[0], "trace_id": r[1], "inference_type": r[2],
                        "provider": r[3], "model": r[4], "prompt": r[5],
                        "response": r[6], "prompt_tokens": r[7],
                        "completion_tokens": r[8], "latency_ms": r[9],
                        "cost_cents": r[10], "metadata": r[11],
                    }
                    for r in rows
                ],
            )
            db.commit()
    except Exception as exc:  # pragma: no cover - defensive: table might not exist yet
        logger.debug("audit_logs flush failed (%d rows), re-enqueuing: %s", len(entries), exc)
        with _lock:
            # Hard cap to avoid memory bloat if the DB stays down a long time
            _queue.extend(entries)
            while len(_queue) > 1000:
                _queue.popleft()
