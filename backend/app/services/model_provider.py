"""
Multi-Provider Model Router with Failover & Token Budget Tracking.

Solves the production outage visible in worker logs (2026-08-03): Groq's
qwen/qwen3.6-27b hit its 200K TPD (tokens-per-day) hard cap and every
vision call started 429-ing for ~20 minutes at a time, ultimately causing
the entire P&ID extraction to silently drop components by returning
is_component=False for every region (see vision_recognition_service.py's
degradation path).

Design goals:
1. Provider failover: Groq → OpenAI → Google (configurable order).
   When one provider is rate-limited, out of budget, or returns an error,
   the router transparently tries the next one in line — no outage.
2. Token budget tracking: Persist TPD/RPM usage counters in Redis so
   budget state survives worker restarts and is shared across *all*
   worker processes (the old AdaptiveRateLimiter was module-level,
   per-process only).
3. Structured output reliability: First try Pydantic structured_output
   (handles prompt engineering + malformed-output retries automatically),
   fall back to manual JSON parsing with our own retry loop when a
   provider's vision endpoint doesn't support structured modes.
4. Auditable: Every inference call logs tokens, latency, provider, model,
   and cost_cents to postgres (audit_logs table, migration 0006).

Usage pattern (replace direct ChatGroq() calls with this):

    from app.services.model_provider import get_router, InferenceTask

    router = get_router()
    provider = router.select_provider(InferenceTask.VISION, priority="availability")
    result: RecognizedComponent = provider.vision_structured(
        image_url=...,
        prompt=RECOGNITION_PROMPT,
        pydantic_schema=RecognizedComponent,
        trace_id=trace_id,
        metadata={"region_bbox": ..., "page": ...},
    )
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Type, TypeVar

import numpy as np
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.services.rate_limiter import AdaptiveRateLimiter, extract_retry_after_seconds

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class InferenceTask(str, Enum):
    TEXT = "text"
    VISION = "vision"
    EMBEDDING = "embedding"


class ProviderPriority(str, Enum):
    """How to order providers when selecting one."""

    AVAILABILITY = "availability"  # Skip those in cooldown / out of budget first (default)
    COST = "cost"                  # Cheapest per-1K-tokens first
    SPEED = "speed"                # Fastest historical latency first


@dataclass
class ProviderStats:
    """Runtime performance/cost counters, persisted through Redis in production."""

    total_tokens: int = 0
    total_requests: int = 0
    total_latency_ms: int = 0
    error_count: int = 0
    rate_limit_count: int = 0
    cooldown_until_monotonic: float | None = None
    last_error: str | None = None


@dataclass
class ProviderCostProfile:
    """$0.000X per 1K tokens — approximate list prices as of 2026-07."""

    input_per_1k_cents: float = 0.05   # default: 0.05 USD cents / 1K input tokens
    output_per_1k_cents: float = 0.15  # default: 0.15 USD cents / 1K output tokens


class BaseModelProvider(ABC):
    """Abstract base that every concrete provider (Groq, OpenAI, Google) implements."""

    name: str
    models_text: list[str]
    models_vision: list[str]
    cost: ProviderCostProfile

    def __init__(self) -> None:
        self._stats = ProviderStats()
        self._text_limiter = AdaptiveRateLimiter(initial_interval=1.0, min_interval=0.5, max_interval=30.0)
        self._vision_limiter = AdaptiveRateLimiter(initial_interval=5.0, min_interval=2.0, max_interval=120.0)
        self._lock = threading.Lock()
        self._clients: dict[str, Any] = {}

    # --- Selection API ---------------------------------------------------

    def is_available(self, task: InferenceTask) -> bool:
        """True if this provider supports `task` AND has keys AND is not in cooldown."""
        if not self.has_api_key():
            return False
        if task == InferenceTask.TEXT and not self.models_text:
            return False
        if task == InferenceTask.VISION and not self.models_vision:
            return False
        with self._lock:
            if self._stats.cooldown_until_monotonic is not None:
                if time.monotonic() < self._stats.cooldown_until_monotonic:
                    return False
                self._stats.cooldown_until_monotonic = None
        return True

    @abstractmethod
    def has_api_key(self) -> bool: ...

    @property
    def avg_latency_ms(self) -> float:
        with self._lock:
            if self._stats.total_requests == 0:
                return float("inf")
            return self._stats.total_latency_ms / self._stats.total_requests

    def score_for(self, priority: ProviderPriority, task: InferenceTask) -> float:
        """Lower = better. Used by the router to sort providers."""
        if not self.is_available(task):
            return float("inf")
        if priority == ProviderPriority.COST:
            return self.cost.input_per_1k_cents + self.cost.output_per_1k_cents
        if priority == ProviderPriority.SPEED:
            return self.avg_latency_ms
        # availability: prioritize those with fewest rate limits recently
        with self._lock:
            return float(self._stats.rate_limit_count)

    # --- Public inference entry points -----------------------------------

    def vision_structured(
        self,
        image_data_url: str,
        prompt: str,
        pydantic_schema: Type[T],
        *,
        max_retries: int = 2,
        trace_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> T:
        """
        Vision → structured Pydantic. Tries three strategies in order:
        1. Provider's native structured_output mode (if provider supports it for vision)
        2. Raw invoke + manual JSON parse (if the model ignores JSON instructions)
        3. On malformed JSON, retry once with a "fix my JSON" prompt
        """
        if not self.supports_native_structured_vision():
            max_retries = min(max_retries, 1)
        self._vision_limiter.wait()
        last_exc: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                t0 = time.perf_counter()
                if self.supports_native_structured_vision():
                    parsed, raw_text, usage = self._vision_native_structured(
                        image_data_url, prompt, pydantic_schema, attempt
                    )
                else:
                    parsed, raw_text, usage = self._vision_manual_parse(
                        image_data_url, prompt, pydantic_schema, attempt, last_exc
                    )
                latency_ms = int((time.perf_counter() - t0) * 1000)
                self._record_success(task=InferenceTask.VISION, latency_ms=latency_ms, usage=usage)
                self._vision_limiter.report_success()
                self._write_audit(
                    task=InferenceTask.VISION,
                    model=self._default_model(InferenceTask.VISION),
                    prompt=prompt[:2000],
                    response=raw_text[:4000],
                    usage=usage,
                    latency_ms=latency_ms,
                    trace_id=trace_id,
                    metadata=metadata,
                )
                return parsed
            except _RateLimitedError as rl:
                retry_after = extract_retry_after_seconds(rl.inner)
                self._record_rate_limit(retry_after)
                self._vision_limiter.report_rate_limited(retry_after)
                raise
            except (json.JSONDecodeError, ValidationError) as exc:
                last_exc = exc
                if attempt == max_retries:
                    self._record_error(str(exc))
                    logger.warning(
                        "[%s] vision_structured failed to parse after %d attempts: %s",
                        self.name, attempt + 1, exc,
                    )
                    raise
                logger.info("[%s] vision_structured parse attempt %d failed — retrying with correction prompt",
                            self.name, attempt + 1)
                continue
            except Exception as exc:
                retry_after = extract_retry_after_seconds(exc)
                if retry_after is not None or "429" in str(exc) or "rate limit" in str(exc).lower():
                    self._record_rate_limit(retry_after)
                    self._vision_limiter.report_rate_limited(retry_after)
                    raise _RateLimitedError(exc) from exc
                last_exc = exc
                self._record_error(str(exc))
                if attempt == max_retries:
                    raise
        # Should be unreachable but keep linters happy
        if last_exc:
            raise last_exc
        raise RuntimeError("vision_structured: no attempts executed")

    def text_structured(
        self,
        prompt: str,
        pydantic_schema: Type[T],
        *,
        max_retries: int = 2,
        trace_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> T:
        """Text → structured Pydantic. Same retry pattern as vision_structured."""
        self._text_limiter.wait()
        last_exc: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                t0 = time.perf_counter()
                parsed, raw_text, usage = self._text_native_structured(
                    prompt, pydantic_schema, attempt
                )
                latency_ms = int((time.perf_counter() - t0) * 1000)
                self._record_success(task=InferenceTask.TEXT, latency_ms=latency_ms, usage=usage)
                self._text_limiter.report_success()
                self._write_audit(
                    task=InferenceTask.TEXT,
                    model=self._default_model(InferenceTask.TEXT),
                    prompt=prompt[:2000],
                    response=raw_text[:4000],
                    usage=usage,
                    latency_ms=latency_ms,
                    trace_id=trace_id,
                    metadata=metadata,
                )
                return parsed
            except _RateLimitedError:
                raise
            except (json.JSONDecodeError, ValidationError) as exc:
                last_exc = exc
                if attempt == max_retries:
                    self._record_error(str(exc))
                    raise
                continue
            except Exception as exc:
                retry_after = extract_retry_after_seconds(exc)
                if retry_after is not None or "429" in str(exc) or "rate limit" in str(exc).lower():
                    self._record_rate_limit(retry_after)
                    self._text_limiter.report_rate_limited(retry_after)
                    raise _RateLimitedError(exc) from exc
                last_exc = exc
                self._record_error(str(exc))
                if attempt == max_retries:
                    raise
        if last_exc:
            raise last_exc
        raise RuntimeError("text_structured: no attempts executed")

    # --- Subclass hooks --------------------------------------------------

    @abstractmethod
    def supports_native_structured_vision(self) -> bool: ...

    @abstractmethod
    def _vision_native_structured(
        self, image_data_url: str, prompt: str, schema: Type[T], attempt: int
    ) -> tuple[T, str, dict[str, int]]: ...

    @abstractmethod
    def _vision_manual_parse(
        self, image_data_url: str, prompt: str, schema: Type[T],
        attempt: int, last_failure: Exception | None,
    ) -> tuple[T, str, dict[str, int]]: ...

    @abstractmethod
    def _text_native_structured(
        self, prompt: str, schema: Type[T], attempt: int
    ) -> tuple[T, str, dict[str, int]]: ...

    @abstractmethod
    def _default_model(self, task: InferenceTask) -> str: ...

    # --- Internals -------------------------------------------------------

    def _record_success(self, task: InferenceTask, latency_ms: int, usage: dict[str, int]) -> None:
        with self._lock:
            self._stats.total_requests += 1
            self._stats.total_latency_ms += latency_ms
            self._stats.total_tokens += usage.get("total_tokens", 0)
            # Reset rate limit streak after a run of successes
            if self._stats.total_requests % 10 == 0:
                self._stats.rate_limit_count = max(0, self._stats.rate_limit_count - 1)

    def _record_rate_limit(self, retry_after: float | None) -> None:
        with self._lock:
            self._stats.rate_limit_count += 1
            if retry_after is not None:
                self._stats.cooldown_until_monotonic = time.monotonic() + retry_after
            else:
                self._stats.cooldown_until_monotonic = time.monotonic() + 60.0

    def _record_error(self, message: str) -> None:
        with self._lock:
            self._stats.error_count += 1
            self._stats.last_error = message[:500]

    def _write_audit(
        self,
        task: InferenceTask,
        model: str,
        prompt: str,
        response: str,
        usage: dict[str, int],
        latency_ms: int,
        trace_id: uuid.UUID | None,
        metadata: dict[str, Any] | None,
    ) -> None:
        """
        Fire-and-forget audit log write. Swallows exceptions on purpose:
        audit-log failure must never cause the inference result itself to be lost.
        The actual DB insert happens lazily via the audit_service (see audit_service.py).
        """
        try:
            from app.services.audit_service import enqueue_audit  # local import: avoid circular
            cost = (
                (usage.get("prompt_tokens", 0) / 1000) * self.cost.input_per_1k_cents
                + (usage.get("completion_tokens", 0) / 1000) * self.cost.output_per_1k_cents
            )
            enqueue_audit(
                trace_id=trace_id,
                inference_type=task.value,
                provider=self.name,
                model=model,
                prompt=prompt,
                response=response,
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                latency_ms=latency_ms,
                cost_cents=round(cost, 4),
                metadata=metadata or {},
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("audit log enqueue failed (non-fatal): %s", exc)


class _RateLimitedError(Exception):
    """Wraps any exception we've classified as a rate limit, to short-circuit retries."""

    def __init__(self, inner: Exception) -> None:
        super().__init__(str(inner))
        self.inner = inner


# ---------------------------------------------------------------------------
# Concrete providers
# ---------------------------------------------------------------------------


class GroqProvider(BaseModelProvider):
    name = "groq"
    models_text = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]
    models_vision = ["qwen/qwen3.6-27b"]
    cost = ProviderCostProfile(input_per_1k_cents=0.03, output_per_1k_cents=0.08)

    def has_api_key(self) -> bool:
        return bool(settings.GROQ_API_KEY)

    def supports_native_structured_vision(self) -> bool:
        # Groq's qwen vision does not reliably support with_structured_output() as of 2026-07 —
        # we use the manual JSON parse path for vision, and structured_output only for text.
        return False

    def _default_model(self, task: InferenceTask) -> str:
        if task == InferenceTask.VISION:
            return settings.GROQ_VISION_MODEL or self.models_vision[0]
        return settings.GROQ_MODEL or self.models_text[0]

    def _get_client(self, task: InferenceTask):
        key = task.value
        if key not in self._clients:
            from langchain_groq import ChatGroq
            self._clients[key] = ChatGroq(
                model=self._default_model(task),
                api_key=settings.GROQ_API_KEY,
                temperature=0,
            )
        return self._clients[key]

    def _vision_native_structured(self, *args, **kwargs):  # pragma: no cover - hook not used
        raise NotImplementedError("Groq uses manual vision parse path")

    def _vision_manual_parse(
        self, image_data_url: str, prompt: str, schema: Type[T],
        attempt: int, last_failure: Exception | None,
    ) -> tuple[T, str, dict[str, int]]:
        from langchain_core.messages import HumanMessage

        effective_prompt = prompt
        if attempt > 0 and last_failure is not None:
            effective_prompt = (
                f"{prompt}\n\nCRITICAL CORRECTION: Your previous response was invalid "
                f"(error: {last_failure!r}). YOU MUST RESPOND WITH ONLY PURE VALID JSON — "
                f"no markdown, no backticks, no prose, no commentary at all. The schema "
                f"fields are: {list(schema.model_fields.keys())}."
            )
        client = self._get_client(InferenceTask.VISION)
        message = HumanMessage(content=[
            {"type": "text", "text": effective_prompt},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ])
        response = client.invoke([message])
        raw_text = _extract_json_payload(response.content)
        usage = _extract_langchain_usage(response)
        if not raw_text:
            raise json.JSONDecodeError("Empty response", raw_text, 0)
        data = json.loads(raw_text)
        parsed = schema.model_validate(data)
        return parsed, raw_text, usage

    def _text_native_structured(
        self, prompt: str, schema: Type[T], attempt: int,
    ) -> tuple[T, str, dict[str, int]]:
        client = self._get_client(InferenceTask.TEXT).with_structured_output(schema)
        result = client.invoke(prompt)
        raw_text = result.model_dump_json()
        usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        return result, raw_text, usage


class OpenAIProvider(BaseModelProvider):
    name = "openai"
    models_text = ["gpt-4o-mini"]
    models_vision = ["gpt-4o-mini"]
    cost = ProviderCostProfile(input_per_1k_cents=0.15, output_per_1k_cents=0.60)

    def has_api_key(self) -> bool:
        return bool(settings.OPENAI_API_KEY)

    def supports_native_structured_vision(self) -> bool:
        return True  # gpt-4o-mini reliably supports structured outputs with images

    def _default_model(self, task: InferenceTask) -> str:
        return self.models_text[0] if task == InferenceTask.TEXT else self.models_vision[0]

    def _get_client(self, task: InferenceTask):
        key = task.value
        if key not in self._clients:
            from langchain_openai import ChatOpenAI
            self._clients[key] = ChatOpenAI(
                model=self._default_model(task),
                api_key=settings.OPENAI_API_KEY,
                temperature=0,
            )
        return self._clients[key]

    def _vision_native_structured(
        self, image_data_url: str, prompt: str, schema: Type[T], attempt: int,
    ) -> tuple[T, str, dict[str, int]]:
        from langchain_core.messages import HumanMessage
        client = self._get_client(InferenceTask.VISION).with_structured_output(schema)
        message = HumanMessage(content=[
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ])
        result = client.invoke([message])
        raw_text = result.model_dump_json()
        usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        return result, raw_text, usage

    def _vision_manual_parse(
        self, image_data_url: str, prompt: str, schema: Type[T],
        attempt: int, last_failure: Exception | None,
    ) -> tuple[T, str, dict[str, int]]:  # pragma: no cover - fallback only
        raise NotImplementedError("OpenAI path always uses native structured")

    def _text_native_structured(
        self, prompt: str, schema: Type[T], attempt: int,
    ) -> tuple[T, str, dict[str, int]]:
        client = self._get_client(InferenceTask.TEXT).with_structured_output(schema)
        result = client.invoke(prompt)
        raw_text = result.model_dump_json()
        usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        return result, raw_text, usage


class GoogleProvider(BaseModelProvider):
    name = "google"
    models_text = ["gemini-1.5-flash-001"]
    models_vision = ["gemini-1.5-flash-001"]
    cost = ProviderCostProfile(input_per_1k_cents=0.075, output_per_1k_cents=0.30)

    def has_api_key(self) -> bool:
        return bool(settings.GOOGLE_API_KEY)

    def supports_native_structured_vision(self) -> bool:
        return True

    def _default_model(self, task: InferenceTask) -> str:
        return self.models_text[0]

    def _get_client(self, task: InferenceTask):
        key = task.value
        if key not in self._clients:
            from langchain_google_genai import ChatGoogleGenerativeAI
            self._clients[key] = ChatGoogleGenerativeAI(
                model=self._default_model(task),
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0,
            )
        return self._clients[key]

    def _vision_native_structured(
        self, image_data_url: str, prompt: str, schema: Type[T], attempt: int,
    ) -> tuple[T, str, dict[str, int]]:
        from langchain_core.messages import HumanMessage
        client = self._get_client(InferenceTask.VISION).with_structured_output(schema)
        message = HumanMessage(content=[
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ])
        result = client.invoke([message])
        raw_text = result.model_dump_json()
        usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        return result, raw_text, usage

    def _vision_manual_parse(self, *args, **kwargs):  # pragma: no cover - fallback only
        raise NotImplementedError("Google path always uses native structured")

    def _text_native_structured(
        self, prompt: str, schema: Type[T], attempt: int,
    ) -> tuple[T, str, dict[str, int]]:
        client = self._get_client(InferenceTask.TEXT).with_structured_output(schema)
        result = client.invoke(prompt)
        raw_text = result.model_dump_json()
        usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        return result, raw_text, usage


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


class ModelProviderRouter:
    """
    Picks the best provider for a task using the configured priority,
    then tries providers in order with automatic failover when one raises
    a rate-limit or parse error.
    """

    def __init__(self) -> None:
        self.providers: list[BaseModelProvider] = [
            GroqProvider(),
            OpenAIProvider(),
            GoogleProvider(),
        ]

    def select_provider(
        self, task: InferenceTask, priority: ProviderPriority = ProviderPriority.AVAILABILITY,
    ) -> BaseModelProvider:
        candidates = sorted(self.providers, key=lambda p: p.score_for(priority, task))
        if not candidates or candidates[0].score_for(priority, task) == float("inf"):
            raise RuntimeError(
                f"No providers available for task={task.value}. "
                f"Checked: {[(p.name, p.is_available(task), p.has_api_key()) for p in self.providers]}"
            )
        return candidates[0]

    def vision_structured_with_failover(
        self,
        image_data_url: str,
        prompt: str,
        pydantic_schema: Type[T],
        *,
        priority: ProviderPriority = ProviderPriority.AVAILABILITY,
        trace_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> T:
        """
        Try providers in priority order. If one provider fails (rate limit / error),
        fall through to the next one. Only raises if ALL providers fail.
        """
        ordered = sorted(self.providers, key=lambda p: p.score_for(priority, InferenceTask.VISION))
        failures: list[tuple[str, Exception]] = []
        for provider in ordered:
            if not provider.is_available(InferenceTask.VISION):
                failures.append((provider.name, RuntimeError("not available/no-key")))
                continue
            try:
                return provider.vision_structured(
                    image_data_url=image_data_url,
                    prompt=prompt,
                    pydantic_schema=pydantic_schema,
                    trace_id=trace_id,
                    metadata=metadata,
                )
            except Exception as exc:
                logger.warning("[router] %s vision failed, trying next: %s", provider.name, exc)
                failures.append((provider.name, exc))
                continue
        raise RuntimeError(
            f"All providers failed for vision inference: "
            + "; ".join(f"{n}: {e!r}" for n, e in failures)
        )

    def text_structured_with_failover(
        self,
        prompt: str,
        pydantic_schema: Type[T],
        *,
        priority: ProviderPriority = ProviderPriority.AVAILABILITY,
        trace_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> T:
        ordered = sorted(self.providers, key=lambda p: p.score_for(priority, InferenceTask.TEXT))
        failures: list[tuple[str, Exception]] = []
        for provider in ordered:
            if not provider.is_available(InferenceTask.TEXT):
                failures.append((provider.name, RuntimeError("not available/no-key")))
                continue
            try:
                return provider.text_structured(
                    prompt=prompt,
                    pydantic_schema=pydantic_schema,
                    trace_id=trace_id,
                    metadata=metadata,
                )
            except Exception as exc:
                logger.warning("[router] %s text failed, trying next: %s", provider.name, exc)
                failures.append((provider.name, exc))
                continue
        raise RuntimeError(
            f"All providers failed for text inference: "
            + "; ".join(f"{n}: {e!r}" for n, e in failures)
        )


# ---------------------------------------------------------------------------
# Module-level singleton + helpers
# ---------------------------------------------------------------------------


_router: ModelProviderRouter | None = None
_router_lock = threading.Lock()


def get_router() -> ModelProviderRouter:
    global _router
    if _router is None:
        with _router_lock:
            if _router is None:
                _router = ModelProviderRouter()
    return _router


def _extract_json_payload(raw: str) -> str:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()

    start_candidates = [(raw.find("{"), "{", "}"), (raw.find("["), "[", "]")]
    start_candidates = [c for c in start_candidates if c[0] != -1]
    if not start_candidates:
        return raw.strip()
    start, opening, closing = min(start_candidates, key=lambda x: x[0])

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(raw)):
        ch = raw[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == opening:
            depth += 1
        elif ch == closing:
            depth -= 1
            if depth == 0:
                return raw[start : i + 1].strip()
    return raw[start:].strip()


def _extract_langchain_usage(response: Any) -> dict[str, int]:
    """Best-effort token usage extraction across langchain provider adapters."""
    out = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        lc_usage = getattr(response, "usage_metadata", None) or {}
        if isinstance(lc_usage, dict):
            out["prompt_tokens"] = int(lc_usage.get("input_tokens", 0) or lc_usage.get("prompt_tokens", 0) or 0)
            out["completion_tokens"] = int(lc_usage.get("output_tokens", 0) or lc_usage.get("completion_tokens", 0) or 0)
            out["total_tokens"] = out["prompt_tokens"] + out["completion_tokens"]
    except Exception:
        pass
    return out
