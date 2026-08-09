import re
import random
import threading
import time


class AdaptiveRateLimiter:
    """
    Self-tuning request pacer, used in place of a fixed sleep() delay.

    Why this exists: real testing showed a fixed delay constant is always
    either too slow (wasting time when the server has headroom) or too fast
    (triggering 429s and wasted retry round-trips) — and the "right" value
    drifts over time as Groq's load, your account's usage window, and
    possibly your billing tier change. A fixed number picked from a few
    minutes of logs today is not a permanent fix; it just moves the problem
    to "someone has to notice it's wrong again later and edit a constant."

    Instead: start with a reasonable interval, then adjust it up when the
    server says we're going too fast (429/503, using its own Retry-After /
    "try again in Xs" guidance when available) and gently relax it back down
    when requests keep succeeding. This tracks the server's real, current
    behavior automatically instead of a stale guess.

    Thread-safe (a lock guards state) even though Celery's --pool=solo is
    single-threaded today — cheap insurance against a future pool change.
    """

    def __init__(
        self,
        initial_interval: float = 5.0,
        min_interval: float = 2.0,
        max_interval: float = 60.0,
    ):
        self._interval = initial_interval
        self._min_interval = min_interval
        self._max_interval = max_interval
        self._last_request_time: float | None = None
        self._lock = threading.Lock()

    def wait(self) -> None:
        """Call before making a request — sleeps just enough to respect the current interval."""
        with self._lock:
            now = time.monotonic()
            if self._last_request_time is not None:
                elapsed = now - self._last_request_time
                remaining = self._interval - elapsed
                if remaining > 0:
                    time.sleep(remaining + random.uniform(0.0, min(0.25, remaining)))
            self._last_request_time = time.monotonic()

    def report_rate_limited(self, retry_after_seconds: float | None = None) -> None:
        """
        Call after a 429/503. If the server told us how long to wait
        (retry_after_seconds), trust that directly — it's the actual answer,
        not a guess. Otherwise back off by a fixed multiplier.
        """
        with self._lock:
            if retry_after_seconds is not None:
                base = max(self._interval, retry_after_seconds)
            else:
                base = self._interval * 1.5
            base = min(self._max_interval, base)
            self._interval = min(self._max_interval, base * random.uniform(1.0, 1.2))

    def report_success(self) -> None:
        """
        Call after a successful request. Slowly relax the interval — a
        small step, not a snap back to the minimum, so a single lucky
        request doesn't immediately undo a hard-won lesson from recent
        rate limiting.
        """
        with self._lock:
            self._interval = max(self._min_interval, self._interval * 0.97)

    @property
    def current_interval(self) -> float:
        return self._interval


_RETRY_AFTER_PATTERN = re.compile(r"try again in (\d+)m([\d.]+)s|try again in ([\d.]+)s")


def extract_retry_after_seconds(exc: BaseException) -> float | None:
    """
    Best-effort extraction of the server's actual suggested wait time.
    Tries the HTTP Retry-After header first (most reliable, if the SDK
    exposes the raw response), then falls back to parsing Groq's own
    "Please try again in 9m54.432s" / "try again in 27s" message text,
    which is what its TPD/RPM/TPM error messages contain. Returns None
    (not a crash) if neither is available — callers should have a
    non-retry_after fallback in that case.
    """
    response = getattr(exc, "response", None)
    if response is not None:
        headers = getattr(response, "headers", None)
        if headers:
            raw = headers.get("retry-after") or headers.get("Retry-After")
            if raw:
                try:
                    return float(raw)
                except (TypeError, ValueError):
                    pass

    message = str(exc)
    match = _RETRY_AFTER_PATTERN.search(message)
    if match:
        if match.group(1) is not None:
            minutes, seconds = match.group(1), match.group(2)
            return float(minutes) * 60 + float(seconds)
        if match.group(3) is not None:
            return float(match.group(3))

    return None
