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
    drawing_number: Mapped[str] = mapped_column(String(100), nullable=False)

    # "baseline" or "revision" — kept as a plain validated string rather than
    # a native Postgres ENUM so adding new types later doesn't need a migration.
    drawing_type: Mapped[str] = mapped_column(String(20), nullable=False)

    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    object_key: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # uploaded -> processing -> processed -> failed (driven by the AI pipeline from Step 4)
    status: Mapped[str] = mapped_column(String(20), default="uploaded", nullable=False)

    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
