import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class DiffItem(Base):
    """
    One classified diff finding within a Comparison. Every finding links back
    (where applicable) to the exact ExtractedParameter row on each side, so the
    UI can jump straight to the bounding box on the original baseline/revision
    drawing — this is the "complete traceability" requirement from the brief.
    """

    __tablename__ = "diff_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    comparison_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comparisons.id"), nullable=False, index=True
    )

    # modified | missing | added | matching
    classification: Mapped[str] = mapped_column(String(20), nullable=False)

    parameter_name: Mapped[str] = mapped_column(String(255), nullable=False)

    baseline_parameter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("extracted_parameters.id"), nullable=True
    )
    revision_parameter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("extracted_parameters.id"), nullable=True
    )

    baseline_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    revision_value: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # How confident the fuzzy-match/classification step is that this pairing
    # (or non-pairing, for missing/added) is correct.
    match_confidence: Mapped[float] = mapped_column(Float, nullable=False)

    explanation: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
