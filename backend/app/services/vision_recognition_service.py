"""
P&ID Vision Component Recognition — REFACTORED Phase 3A.

Changelog vs prior version:
1. No more direct ChatGroq() calls. Uses model_provider.py's failover router:
   Groq (primary, cheapest) → OpenAI gpt-4o-mini → Google gemini-1.5-flash
   → final graceful degradation to "not a component" if ALL providers down.
   This eliminates the hours-long outage pattern from the 2026-08-03 logs
   where Groq hit 200K TPD and every region silently failed.
2. The router itself handles:
   - Pydantic structured output (native on OpenAI/Google, parse+retry on Groq)
   - Malformed JSON retries with "fix the JSON" correction prompts
   - Adaptive rate limiting (per-provider, no shared-module singleton issues)
   - Audit logging of every call (prompt, response, tokens, latency, cost)
3. This file's own retry/backoff + manual JSON cleanup is GONE — it's now a
   thin wrapper that enriches the router's result with traceability metadata.
"""

from __future__ import annotations

import base64
import logging
import uuid

import cv2
import numpy as np
from pydantic import BaseModel

from app.services.model_provider import get_router

logger = logging.getLogger(__name__)


class RecognizedComponent(BaseModel):
    is_component: bool
    component_type: str | None = None
    tag: str | None = None
    specification: str | None = None
    confidence: float = 0.0


RECOGNITION_PROMPT = """You are an engineering analyst reviewing a small cropped region \
from a P&ID (Piping & Instrumentation Diagram). This crop was found by a simple contour \
detector and MAY be a real engineering component symbol (valve, pump, instrument, vessel, \
tank, compressor, filter, sensor, etc.), OR it may be noise: a piece of a connecting line, \
a title-block fragment, decorative border, or blank space with no real content.

Look carefully and decide:
1. Is this actually a recognizable engineering component symbol? (not just a line segment \
or blank/noise region)
2. If yes, what type of component is it (e.g. "gate valve", "centrifugal pump", \
"pressure transmitter", "storage tank")?
3. Is there a tag/label visible near the symbol (e.g. "PV-101", "P-204A")?
4. Is there a specification or rating visible (e.g. "150#", "SS316", "2 inch")?
"""


def _encode_image_to_data_url(image: np.ndarray, max_dimension: int = 384) -> str:
    """
    Downscale + JPEG encode. See prior version comments for the rationale:
    image tokenization cost scales roughly with resolution; 384px is still
    plenty for a single component symbol + its adjacent tag text. Kept this
    exactly as before (no reason to change).
    """
    h, w = image.shape[:2]
    scale = max_dimension / max(h, w)
    if scale < 1.0:
        image = cv2.resize(
            image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA
        )

    success, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not success:
        raise ValueError("Failed to encode image crop to JPEG")
    b64 = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def recognize_component(
    image_crop: np.ndarray,
    *,
    trace_id: uuid.UUID | None = None,
    region_metadata: dict | None = None,
) -> RecognizedComponent:
    """
    Send one cropped region to the vision model via the failover router.

    Behavior on failure (explicit, unchanged philosophy from prior version):
    - Empty crop → immediately return `is_component=False` (no error).
    - All providers exhausted / unresponsive → log warning, degrade to
      `is_component=False` rather than aborting the whole P&ID extraction.
      One bad region must not discard every other component.

    Args:
        image_crop: The region's BGR crop (from OpenCV / pid_extraction_graph).
        trace_id: Optional UUID shared across all inferences from one
            Celery task. Lets audit_logs be grouped into a single trace.
        region_metadata: Optional dict (e.g. {"bbox": ..., "page": ...,
            "heuristics": {"solidity": ...}}) persisted to audit_logs so the
            exact region that produced this inference call can be reproduced.
    """
    if image_crop.size == 0:
        return RecognizedComponent(is_component=False, confidence=0.0)

    try:
        data_url = _encode_image_to_data_url(image_crop)
    except Exception as exc:
        logger.warning("Image crop encoding failed, skipping region: %s", exc)
        return RecognizedComponent(is_component=False, confidence=0.0)

    router = get_router()
    try:
        return router.vision_structured_with_failover(
            image_data_url=data_url,
            prompt=RECOGNITION_PROMPT,
            pydantic_schema=RecognizedComponent,
            trace_id=trace_id,
            metadata=region_metadata,
        )
    except Exception as exc:
        logger.warning(
            "Vision recognition failed for one region (ALL providers exhausted) — "
            "degrading to 'not a component': %s",
            exc,
        )
        return RecognizedComponent(is_component=False, confidence=0.0)
