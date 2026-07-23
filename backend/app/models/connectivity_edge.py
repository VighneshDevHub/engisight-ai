import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ConnectivityEdge(Base):
    """
    A traced connection between two BoM components on the same P&ID — e.g. a
    pipe/signal line running from a pump outlet to a valve inlet. Used to
    validate process flow: every component should have at least one edge,
    and edges should form a coherent flow rather than dangling ends.
    """

    __tablename__ = "connectivity_edges"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    drawing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drawings.id"), nullable=False, index=True
    )
    source_component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bom_items.id"), nullable=False
    )
    target_component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bom_items.id"), nullable=False
    )

    # "pipe", "signal", "electrical" — kept as a plain string, same reasoning
    # as Drawing.drawing_type: new connection types shouldn't need a migration.
    connection_type: Mapped[str] = mapped_column(String(50), default="pipe", nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
