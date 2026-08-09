import io
import uuid

from app.core.celery_app import celery_app
from app.db.session import SyncSessionLocal
from app.models.bom_item import BomItem
from app.models.comparison import Comparison
from app.models.diff_item import DiffItem
from app.models.drawing import Drawing
from app.models.user import User  # noqa: F401  -- needed so Drawing.uploaded_by's FK resolves
from app.models.extracted_parameter import ExtractedParameter
from app.services.storage_service import storage_service
from app.services.audit_service import force_flush as flush_audit_logs


@celery_app.task(name="app.workers.tasks.extract_drawing_parameters", bind=True)
def extract_drawing_parameters(self, drawing_id: str) -> dict:
    """
    Full Step 4 pipeline for a single drawing.

    Phase 3A changes:
      1. extraction_run_id: every execution creates a NEW run UUID and stamps it on
         rows. The DELETE-then-INSERT pattern of prior versions is replaced with
         INSERT-only-new-run pattern (old rows retained for extraction-run comparison).
      2. trace_id: same run UUID is also forwarded to every LLM call, making every
         audit_logs row traceable back to THIS Celery task.
      3. force_flush audit logs at the end so the run's audit rows are written
         to postgres before the task ends (instead of waiting for the in-memory
         queue's timer).
    """
    trace_id = uuid.uuid4()
    extraction_run_id = trace_id  # same UUID serves both purposes

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

            from app.pipelines.extraction_graph import run_extraction_pipeline

            final_state = run_extraction_pipeline(file_bytes, drawing.content_type,
                                                   trace_id=trace_id)

            for param in final_state["structured_parameters"]:
                db.add(
                    ExtractedParameter(
                        drawing_id=drawing.id,
                        extraction_run_id=extraction_run_id,
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
            flush_audit_logs()

            return {
                "status": "processed",
                "parameter_count": len(final_state["structured_parameters"]),
                "avg_ocr_confidence": final_state["avg_ocr_confidence"],
                "extraction_run_id": str(extraction_run_id),
            }

        except Exception as exc:
            drawing.status = "failed"
            db.commit()
            flush_audit_logs()
            raise exc


@celery_app.task(name="app.workers.tasks.run_comparison", bind=True)
def run_comparison(self, comparison_id: str) -> dict:
    """
    Loads the LATEST extraction run per drawing (max(created_at)) of
    extracted_parameters rows with the latest extraction_run_id per drawing).

    If extraction_run_id tracking is new — rows written by the old code with NULLs are
    still valid and participate as long as they're the most recent rows for their drawing_id.
    """
    trace_id = uuid.uuid4()
    with SyncSessionLocal() as db:
        comparison = db.get(Comparison, uuid.UUID(comparison_id))
        if comparison is None:
            return {"status": "error", "detail": "comparison not found"}

        comparison.status = "processing"
        db.commit()

        try:
            baseline_params = _load_latest_parameters_as_dicts(db, comparison.baseline_drawing_id)
            revision_params = _load_latest_parameters_as_dicts(db, comparison.revision_drawing_id)

            from app.services.diff_engine import run_diff

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
            flush_audit_logs()

            counts: dict[str, int] = {}
            for item in diff_results:
                counts[item["classification"]] = counts.get(item["classification"], 0) + 1

            return {"status": "completed", "diff_item_count": len(diff_results),
                    "counts": counts, "trace_id": str(trace_id)}

        except Exception as exc:
            comparison.status = "failed"
            db.commit()
            flush_audit_logs()
            raise exc


def _load_latest_parameters_as_dicts(db, drawing_id: uuid.UUID) -> list[dict]:
    """
    Return parameters from the drawing's MOST RECENT extraction run.

    Strategy:
      - Find the latest extraction_run_id (including NULL run — i.e. oldest pre-3A
      data via "NULL sorts as an "older-3A-data".
      - Return rows from that run; if all rows have NULL run, return all rows for
        the drawing (compatibility).
    """
    from sqlalchemy import func

    subq = (
        db.query(
            ExtractedParameter.extraction_run_id.label("run_id"),
            func.max(ExtractedParameter.created_at).label("latest_create")
        )
        .filter(ExtractedParameter.drawing_id == drawing_id)
        .group_by(ExtractedParameter.extraction_run_id)
        .order_by(func.max(ExtractedParameter.created_at).desc())
        .limit(1)
        .subquery()
    )
    run_row = db.execute(subq).first()
    target_run_id = run_row[0] if run_row else None
    if run_row:
        query = db.query(ExtractedParameter).filter(
            ExtractedParameter.drawing_id == drawing_id
        )
        query = query.filter(
            (ExtractedParameter.extraction_run_id == target_run_id)
            if target_run_id is not None
            else ExtractedParameter.extraction_run_id.is_(None)
        )
    else:
        query = db.query(ExtractedParameter).filter(
            ExtractedParameter.drawing_id == drawing_id)
    rows = query.all()
    return [
        {
            "id": row.id,
            "parameter_name": row.parameter_name,
            "parameter_value": row.parameter_value,
            "unit": row.unit,
        }
        for row in rows
    ]


@celery_app.task(name="app.workers.tasks.extract_pid_components", bind=True)
def extract_pid_components(self, drawing_id: str) -> dict:
    """
    Phase 2 P&ID pipeline. Same Phase 3A changes as extract_drawing_parameters:
    extraction_run_id + trace_id + final audit flush.
    """
    trace_id = uuid.uuid4()
    extraction_run_id = trace_id

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

            from app.pipelines.pid_extraction_graph import run_pid_extraction_pipeline

            final_state = run_pid_extraction_pipeline(
                file_bytes, drawing.content_type, trace_id=trace_id
            )

            for component in final_state["recognized_components"]:
                db.add(
                    BomItem(
                        drawing_id=drawing.id,
                        extraction_run_id=extraction_run_id,
                        component_type=component["component_type"],
                        tag=component.get("tag"),
                        specification=component.get("specification"),
                        quantity=component.get("quantity", 1),
                        confidence=component["confidence"],
                        source_page=component.get("source_page"),
                        source_bbox=component.get("source_bbox"),
                        source_crop_note=component.get("source_crop_note"),
                    )
                )

            drawing.status = "processed"
            db.commit()
            flush_audit_logs()

            return {
                "status": "processed",
                "component_count": len(final_state["recognized_components"]),
                "regions_proposed": len(final_state["proposed_regions"]),
                "extraction_run_id": str(extraction_run_id),
            }

        except Exception as exc:
            drawing.status = "failed"
            db.commit()
            flush_audit_logs()
            raise exc
