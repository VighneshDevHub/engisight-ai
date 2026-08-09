from typing import TypedDict
import uuid

from langgraph.graph import END, StateGraph

from app.services.detection_service import run_detection
from app.services.llm_service import structure_ocr_text
from app.services.ocr_service import run_ocr
from app.services.preprocessing_service import bytes_to_page_images, preprocess_image

OCR_CONFIDENCE_THRESHOLD = 0.6
MAX_RETRIES = 1


class ExtractionState(TypedDict):
    file_bytes: bytes
    content_type: str
    images: list
    ocr_results: list[dict]
    detections: list[dict]
    structured_parameters: list[dict]
    retry_count: int
    avg_ocr_confidence: float
    trace_id: uuid.UUID | None


def node_load_and_preprocess(state: ExtractionState) -> ExtractionState:
    raw_images = bytes_to_page_images(state["file_bytes"], state["content_type"])
    # Retry passes apply denoising — the OCR confidence gate below decides
    # whether that was actually needed.
    denoise = state["retry_count"] > 0
    state["images"] = [preprocess_image(img, denoise=denoise) for img in raw_images]
    return state


def node_run_ocr(state: ExtractionState) -> ExtractionState:
    all_blocks: list[dict] = []
    for page_idx, image in enumerate(state["images"]):
        for block in run_ocr(image):
            block["page"] = page_idx
            all_blocks.append(block)

    state["ocr_results"] = all_blocks
    state["avg_ocr_confidence"] = (
        sum(b["confidence"] for b in all_blocks) / len(all_blocks) if all_blocks else 0.0
    )
    return state


def node_run_detection(state: ExtractionState) -> ExtractionState:
    all_detections: list[dict] = []
    for page_idx, image in enumerate(state["images"]):
        for det in run_detection(image):
            det["page"] = page_idx
            all_detections.append(det)
    state["detections"] = all_detections
    return state


def node_structure_with_llm(state: ExtractionState) -> ExtractionState:
    text_blocks = [b["text"] for b in state["ocr_results"]]
    structured = structure_ocr_text(text_blocks, trace_id=state.get("trace_id"))

    enriched = []
    for param in structured:
        source_block = _find_source_block(param.source_text, state["ocr_results"])
        enriched.append(
            {
                "parameter_name": param.parameter_name,
                "value": param.value,
                "unit": param.unit,
                "confidence": param.confidence,
                "source_text": param.source_text,
                "source_page": source_block["page"] if source_block else None,
                "source_bbox": source_block["bbox"] if source_block else None,
            }
        )
    state["structured_parameters"] = enriched
    return state


def _find_source_block(source_text: str, ocr_results: list[dict]) -> dict | None:
    """
    Best-effort traceability link: finds the OCR block whose text contains the
    LLM-cited source_text, so every extracted parameter can point back to its
    exact page + bounding box on the original drawing.

    This is exact-substring matching, which is imperfect if the LLM paraphrases
    the OCR text even slightly. A semantic (embedding-based) version of this
    matching is planned for Step 5's diff engine, which needs the same
    fuzzy-matching capability to compare baseline vs. revision parameters.
    """
    needle = source_text.strip().lower()
    if not needle:
        return None
    for block in ocr_results:
        if needle in block["text"].lower():
            return block
    return None


def route_after_ocr(state: ExtractionState) -> str:
    """Conditional edge: if OCR confidence is too low, retry preprocessing with denoising."""
    if state["avg_ocr_confidence"] < OCR_CONFIDENCE_THRESHOLD and state["retry_count"] < MAX_RETRIES:
        state["retry_count"] += 1
        return "retry"
    return "continue"


def build_extraction_graph():
    graph = StateGraph(ExtractionState)
    graph.add_node("preprocess", node_load_and_preprocess)
    graph.add_node("ocr", node_run_ocr)
    graph.add_node("detect", node_run_detection)
    graph.add_node("structure", node_structure_with_llm)

    graph.set_entry_point("preprocess")
    graph.add_edge("preprocess", "ocr")
    graph.add_conditional_edges("ocr", route_after_ocr, {"retry": "preprocess", "continue": "detect"})
    graph.add_edge("detect", "structure")
    graph.add_edge("structure", END)

    return graph.compile()


def run_extraction_pipeline(
    file_bytes: bytes,
    content_type: str,
    *,
    trace_id: uuid.UUID | None = None,
) -> ExtractionState:
    graph = build_extraction_graph()
    initial_state: ExtractionState = {
        "file_bytes": file_bytes,
        "content_type": content_type,
        "images": [],
        "ocr_results": [],
        "detections": [],
        "structured_parameters": [],
        "retry_count": 0,
        "avg_ocr_confidence": 0.0,
        "trace_id": trace_id,
    }
    return graph.invoke(initial_state)
