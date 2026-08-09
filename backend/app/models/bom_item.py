import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class BomItem(Base):
    """
    One recognized engineering component from a P&ID drawing — a valve, pump,
    instrument, vessel, etc. Mirrors ExtractedParameter's traceability pattern
    (Phase 1): every recognized item points back to the exact crop region and
    page it was read from, plus the vision model's confidence.
    """

    __tablename__ = "bom_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    drawing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drawings.id"), nullable=False, index=True
    )
    extraction_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )

    # e.g. "gate valve", "centrifugal pump", "pressure transmitter"
    component_type: Mapped[str] = mapped_column(String(255), nullable=False)
    # e.g. "PV-101", "P-204A" — the tag/label printed next to the symbol
    tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    specification: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    # Traceability — mirrors ExtractedParameter
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source_crop_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
