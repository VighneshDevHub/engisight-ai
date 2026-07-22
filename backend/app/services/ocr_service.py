import numpy as np
from paddleocr import PaddleOCR

_ocr_engine: PaddleOCR | None = None


def get_ocr_engine() -> PaddleOCR:
    """
    Lazily-loaded singleton — PaddleOCR loads its detection + recognition
    models on first use (auto-downloaded on first run; needs internet access
    inside the worker container the first time this runs).
    """
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr_engine


def run_ocr(image: np.ndarray) -> list[dict]:
    """
    Returns a list of {text, confidence, bbox} for one page image.
    bbox is the 4-point polygon PaddleOCR returns: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    — kept as-is (not converted to a simple rect) so downstream traceability can
    highlight the exact region, even for slightly rotated text.
    """
    engine = get_ocr_engine()
    result = engine.ocr(image, cls=True)

    blocks: list[dict] = []
    if result and result[0]:
        for line in result[0]:
            bbox, (text, confidence) = line
            blocks.append({"text": text, "confidence": float(confidence), "bbox": bbox})
    return blocks
