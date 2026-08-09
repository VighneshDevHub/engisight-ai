import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ExtractedParameter(Base):
    """
    One structured engineering parameter pulled from a drawing, e.g.
    {name: "Line pressure rating", value: "150", unit: "psi"} — with enough
    provenance (page, bbox, verbatim OCR snippet) to trace it back to the
    exact spot on the original drawing it came from.

    Phase 3A adds extraction_run_id: every re-run of the extraction pipeline
    writes a NEW set of rows with a NEW extraction_run_id (instead of the
    old DELETE-then-INSERT pattern). Engineers can therefore compare two
    runs (e.g. "why did v2 classify Material as SS304 when v1 said SS316?").
    The "active/latest" run for a drawing is simply the max(created_at) or
    max(extraction_run_id creation time) per drawing_id.
    """

    __tablename__ = "extracted_parameters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    drawing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drawings.id"), nullable=False, index=True
    )
    extraction_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )

    parameter_name: Mapped[str] = mapped_column(String(255), nullable=False)
    parameter_value: Mapped[str] = mapped_column(String(500), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    # Traceability
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
