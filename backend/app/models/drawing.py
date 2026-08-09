import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Drawing(Base):
    __tablename__ = "drawings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Groups a baseline drawing together with all its revisions —
    # comparisons (Step 5) are always scoped to a single project_code.
    project_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True
    )
    drawing_number: Mapped[str] = mapped_column(String(100), nullable=False)

    # "baseline" / "revision" are Phase 1 (drawing comparison).
    # "pid" is Phase 2 (P&ID intelligence).
    # "requirements" is Phase 3 (requirement deviation analysis against drawings).
    # Kept as a validated plain string rather than a native Postgres ENUM —
    # adding new types later does not require an ALTER TYPE migration.
    drawing_type: Mapped[str] = mapped_column(String(20), nullable=False)

    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    object_key: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Hex digest of the file's SHA-256 hash. Used for:
    #   1. Deduplication — an identical re-upload reuses the existing object
    #      rather than storing a duplicate byte-for-byte copy in MinIO/S3.
    #   2. End-to-end integrity checks between upload time, retrieval, and
    #      any AI preprocessing (vision/OCR) that consumes the bytes later.
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # uploaded -> processing -> processed -> failed (driven by the AI pipeline from Step 4)
    status: Mapped[str] = mapped_column(String(20), default="uploaded", nullable=False)

    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
