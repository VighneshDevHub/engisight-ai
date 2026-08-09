from typing import TypedDict
import uuid

from langgraph.graph import END, StateGraph

from app.services.preprocessing_service import bytes_to_page_images, preprocess_image
from app.services.region_proposal_service import crop_region, propose_component_regions
from app.services.vision_recognition_service import recognize_component

# A dense P&ID can produce far more raw contours than are worth sending to
# the vision LLM one-by-one (cost + time). Keep the largest N per page —
# real component symbols tend to be larger than line-segment noise —
# rather than processing every single proposed region. Kept modest (20)
# since real testing showed a full page's worth of regions can take a
# meaningful amount of time against Groq's preview-tier vision model's
# real sustained throughput (see vision_recognition_service.py's
# AdaptiveRateLimiter for why there's no fixed per-request delay here
# anymore — pacing is now handled automatically, based on real server
# feedback, inside recognize_component itself).
MAX_REGIONS_PER_PAGE = 20

# Below this confidence, treat the vision model's "yes it's a component"
# answer as unreliable and drop it rather than polluting the BoM.
MIN_RECOGNITION_CONFIDENCE = 0.4


class PidExtractionState(TypedDict):
    file_bytes: bytes
    content_type: str
    images: list
    proposed_regions: list[dict]
    recognized_components: list[dict]
    trace_id: uuid.UUID | None


def node_preprocess(state: PidExtractionState) -> PidExtractionState:
    raw_images = bytes_to_page_images(state["file_bytes"], state["content_type"])
    state["images"] = [preprocess_image(img) for img in raw_images]
    return state


def node_propose_regions(state: PidExtractionState) -> PidExtractionState:
    all_regions: list[dict] = []
    for page_idx, image in enumerate(state["images"]):
        # propose_component_regions already returns regions sorted by their
        # symbol-likeness score (best first), which combines size + solidity
        # + fill ratio + aspect ratio. Trust that ordering rather than
        # re-sorting by raw area, which was the #1 cause of pipe-segment
        # noise making it into the top-20 ahead of small-but-real valves.
        regions = propose_component_regions(image)
        for region in regions[:MAX_REGIONS_PER_PAGE]:
            region["page"] = page_idx
            all_regions.append(region)
    state["proposed_regions"] = all_regions
    return state


def node_recognize_components(state: PidExtractionState) -> PidExtractionState:
    """
    Passes the trace_id + the region's bbox+heuristics metadata into every
    recognize_component call. Audit logs can then reproduce exactly which
    region crop produced which provider call, grouped under the trace_id
    for this Celery task execution.
    """
    components: list[dict] = []
    trace_id = state.get("trace_id")
    for region in state["proposed_regions"]:
        image = state["images"][region["page"]]
        crop = crop_region(image, region["bbox"])
        region_meta = {
            "page": region["page"],
            "bbox": region["bbox"],
            "score": region.get("score"),
            "heuristics": region.get("heuristics"),
        }
        result = recognize_component(crop, trace_id=trace_id, region_metadata=region_meta)

        if not result.is_component or result.confidence < MIN_RECOGNITION_CONFIDENCE:
            continue

        components.append(
            {
                "component_type": result.component_type or "unclassified component",
                "tag": result.tag,
                "specification": result.specification,
                "quantity": 1,
                "confidence": result.confidence,
                "source_page": region["page"],
                "source_bbox": region["bbox"],
                "source_crop_note": (
                    f"contour-proposed region at {region['bbox']}"
                    f" score={region.get('score')} solidity={region.get('heuristics',{}).get('solidity')}"
                ),
            }
        )
    state["recognized_components"] = components
    return state


def build_pid_extraction_graph():
    graph = StateGraph(PidExtractionState)
    graph.add_node("preprocess", node_preprocess)
    graph.add_node("propose_regions", node_propose_regions)
    graph.add_node("recognize", node_recognize_components)

    graph.set_entry_point("preprocess")
    graph.add_edge("preprocess", "propose_regions")
    graph.add_edge("propose_regions", "recognize")
    graph.add_edge("recognize", END)

    return graph.compile()


def run_pid_extraction_pipeline(
    file_bytes: bytes,
    content_type: str,
    *,
    trace_id: uuid.UUID | None = None,
) -> PidExtractionState:
    graph = build_pid_extraction_graph()
    initial_state: PidExtractionState = {
        "file_bytes": file_bytes,
        "content_type": content_type,
        "images": [],
        "proposed_regions": [],
        "recognized_components": [],
        "trace_id": trace_id,
    }
    return graph.invoke(initial_state)
