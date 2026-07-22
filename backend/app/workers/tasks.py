import io
import uuid

from app.core.celery_app import celery_app
from app.db.session import SyncSessionLocal
from app.models.comparison import Comparison
from app.models.diff_item import DiffItem
from app.models.drawing import Drawing
from app.models.user import User  # noqa: F401  -- needed so Drawing.uploaded_by's FK resolves
from app.models.extracted_parameter import ExtractedParameter
from app.pipelines.extraction_graph import run_extraction_pipeline
from app.services.diff_engine import run_diff
from app.services.storage_service import storage_service


@celery_app.task(name="app.workers.tasks.extract_drawing_parameters", bind=True)
def extract_drawing_parameters(self, drawing_id: str) -> dict:
    """
    Full Step 4 pipeline for a single drawing:
    download from MinIO -> run LangGraph extraction -> persist structured
    parameters -> update Drawing.status. Re-running this for a drawing that
    was already processed clears its previous parameters first (idempotent re-run).
    """
    with SyncSessionLocal() as db:
        drawing = db.get(Drawing, uuid.UUID(drawing_id))
        if drawing is None:
            return {"status": "error", "detail": "drawing not found"}

        drawing.status = "processing"
        db.commit()

        try:
            file_obj = io.BytesIO()
            storage_service.client.download_fileobj(
                storage_service.bucket, drawing.object_key, file_obj
            )
            file_bytes = file_obj.getvalue()

            final_state = run_extraction_pipeline(file_bytes, drawing.content_type)

            db.query(ExtractedParameter).filter(
                ExtractedParameter.drawing_id == drawing.id
            ).delete()

            for param in final_state["structured_parameters"]:
                db.add(
                    ExtractedParameter(
                        drawing_id=drawing.id,
                        parameter_name=param["parameter_name"],
                        parameter_value=param["value"],
                        unit=param.get("unit"),
                        confidence=param["confidence"],
                        source_text=param["source_text"],
                        source_page=param.get("source_page"),
                        source_bbox=param.get("source_bbox"),
                    )
                )

            drawing.status = "processed"
            db.commit()

            return {
                "status": "processed",
                "parameter_count": len(final_state["structured_parameters"]),
                "avg_ocr_confidence": final_state["avg_ocr_confidence"],
            }

        except Exception as exc:
            drawing.status = "failed"
            db.commit()
            raise exc


@celery_app.task(name="app.workers.tasks.run_comparison", bind=True)
def run_comparison(self, comparison_id: str) -> dict:
    """
    Loads all extracted parameters for the baseline and revision drawings of a
    Comparison, runs the diff engine (Qdrant fuzzy matching + classification),
    and persists the resulting DiffItem rows. Requires both drawings to have
    already completed extraction (status == "processed") — the API layer
    enforces this before enqueuing.
    """
    with SyncSessionLocal() as db:
        comparison = db.get(Comparison, uuid.UUID(comparison_id))
        if comparison is None:
            return {"status": "error", "detail": "comparison not found"}

        comparison.status = "processing"
        db.commit()

        try:
            baseline_params = _load_parameters_as_dicts(db, comparison.baseline_drawing_id)
            revision_params = _load_parameters_as_dicts(db, comparison.revision_drawing_id)

            diff_results = run_diff(comparison.id, baseline_params, revision_params)

            db.query(DiffItem).filter(DiffItem.comparison_id == comparison.id).delete()

            for item in diff_results:
                db.add(
                    DiffItem(
                        comparison_id=comparison.id,
                        classification=item["classification"],
                        parameter_name=item["parameter_name"],
                        baseline_parameter_id=item["baseline_parameter_id"],
                        revision_parameter_id=item["revision_parameter_id"],
                        baseline_value=item["baseline_value"],
                        revision_value=item["revision_value"],
                        match_confidence=item["match_confidence"],
                        explanation=item["explanation"],
                    )
                )

            comparison.status = "completed"
            db.commit()

            counts: dict[str, int] = {}
            for item in diff_results:
                counts[item["classification"]] = counts.get(item["classification"], 0) + 1

            return {"status": "completed", "diff_item_count": len(diff_results), "counts": counts}

        except Exception as exc:
            comparison.status = "failed"
            db.commit()
            raise exc


def _load_parameters_as_dicts(db, drawing_id: uuid.UUID) -> list[dict]:
    rows = (
        db.query(ExtractedParameter)
        .filter(ExtractedParameter.drawing_id == drawing_id)
        .all()
    )
    return [
        {
            "id": row.id,
            "parameter_name": row.parameter_name,
            "parameter_value": row.parameter_value,
            "unit": row.unit,
        }
        for row in rows
    ]
