"""
Text structuring LLM service — REFACTORED Phase 3A to use the multi-provider
router. Identical API to the prior version: call structure_ocr_text(blocks)
and receive list[ExtractedParameterLLM].

The router provides: Groq (primary, llama-3.3-70b-versatile) → OpenAI
→ Google, with structured_output retries. Only a very thin wrapper now.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.services.model_provider import InferenceTask, ProviderPriority, get_router


class ExtractedParameterLLM(BaseModel):
    parameter_name: str = Field(
        description="Normalized engineering parameter name, e.g. 'Line pressure rating', "
        "'Pipe diameter', 'Material grade'. Skip title-block boilerplate "
        "(company name, sheet number, drawn-by) unless it is itself an engineering value."
    )
    value: str = Field(description="The value as written, e.g. '150', 'ASTM A106 Gr. B'")
    unit: str | None = Field(default=None, description="Unit if present, e.g. 'psi', 'mm', 'inch'")
    confidence: float = Field(ge=0, le=1, description="Your confidence this is a correct, distinct parameter")
    source_text: str = Field(
        description="The exact verbatim OCR text snippet this parameter was derived from, "
        "used to trace this value back to its source location on the drawing"
    )


class ExtractedParameterList(BaseModel):
    parameters: list[ExtractedParameterLLM]


STRUCTURING_PROMPT = """You are an engineering document analyst reviewing OCR text \
extracted from an engineering drawing (mechanical, piping, structural, or civil).

Given the raw OCR text blocks below, identify distinct engineering parameters: \
dimensions, pressure/temperature ratings, materials, tolerances, quantities, tags, \
and specifications. Normalize each into a clean parameter_name/value/unit triple.

Rules:
- Skip pure title-block boilerplate (company name, sheet number, "drawn by", dates) \
unless it is itself an engineering value (e.g. revision number, scale).
- If the OCR text is garbled/ambiguous, still extract your best interpretation but \
give it a lower confidence score rather than omitting it.
- Every parameter must include source_text: the exact OCR snippet it came from.

OCR TEXT BLOCKS:
{ocr_text}
"""


def structure_ocr_text(
    ocr_text_blocks: list[str],
    *,
    trace_id: uuid.UUID | None = None,
) -> list[ExtractedParameterLLM]:
    if not ocr_text_blocks:
        return []

    prompt = STRUCTURING_PROMPT.format(ocr_text="\n".join(ocr_text_blocks))
    router = get_router()
    result: ExtractedParameterList = router.text_structured_with_failover(
        prompt=prompt,
        pydantic_schema=ExtractedParameterList,
        priority=ProviderPriority.COST,  # text is cheaper to run on multiple providers; prefer lowest cost
        trace_id=trace_id,
        metadata={
            "ocr_block_count": len(ocr_text_blocks),
            "approx_chars": sum(len(b) for b in ocr_text_blocks),
            "task": "drawing_parameter_structuring",
        },
    )
    return result.parameters
