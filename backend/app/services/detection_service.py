import numpy as np
from ultralytics import YOLO

_detection_model: YOLO | None = None


def get_detection_model() -> YOLO:
    """
    Lazily-loaded singleton. Uses the generic pretrained YOLOv11-nano weights
    for now — these were NOT trained on engineering drawings/symbols, so
    detections here are region proposals (bounding boxes of "something drawn
    here"), not accurate engineering-symbol classification.

    Phase 2 fine-tunes a YOLOv11 model on labeled P&ID symbol data once we've
    measured where the vision-LLM extraction alone falls short — this is the
    intentional "vision-LLM first, train only if needed" plan from earlier.

    Auto-downloads weights on first run; needs internet access in the worker
    container the first time this executes.
    """
    global _detection_model
    if _detection_model is None:
        _detection_model = YOLO("yolo11n.pt")
    return _detection_model


def run_detection(image: np.ndarray, confidence_threshold: float = 0.25) -> list[dict]:
    """Returns a list of {label, confidence, bbox: [x1,y1,x2,y2]} for one page image."""
    model = get_detection_model()
    results = model.predict(image, conf=confidence_threshold, verbose=False)

    detections: list[dict] = []
    for r in results:
        for box in r.boxes:
            detections.append(
                {
                    "label": model.names[int(box.cls[0])],
                    "confidence": float(box.conf[0]),
                    "bbox": box.xyxy[0].tolist(),
                }
            )
    return detections
