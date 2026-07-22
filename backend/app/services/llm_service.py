from langchain_groq import ChatGroq
from pydantic import BaseModel, Field

from app.core.config import settings


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


_llm = None


def get_llm():
    global _llm
    if _llm is None:
        if settings.LLM_PROVIDER != "groq":
            raise NotImplementedError(
                f"LLM_PROVIDER={settings.LLM_PROVIDER} not wired yet — only 'groq' is implemented. "
                "Add a branch here when a second provider is needed."
            )
        _llm = ChatGroq(model=settings.GROQ_MODEL, api_key=settings.GROQ_API_KEY, temperature=0)
    return _llm


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


def structure_ocr_text(ocr_text_blocks: list[str]) -> list[ExtractedParameterLLM]:
    """
    Sends already-OCR'd text (not images) to Groq for structuring/classification.
    This is why Groq's lack of strong vision support doesn't matter here — the
    visual extraction already happened via PaddleOCR/YOLOv11 upstream.
    """
    if not ocr_text_blocks:
        return []

    llm = get_llm().with_structured_output(ExtractedParameterList)
    prompt = STRUCTURING_PROMPT.format(ocr_text="\n".join(ocr_text_blocks))
    result: ExtractedParameterList = llm.invoke(prompt)
    return result.parameters
