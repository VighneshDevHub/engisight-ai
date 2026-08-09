import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BomItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    drawing_id: uuid.UUID
    extraction_run_id: uuid.UUID | None
    component_type: str
    tag: str | None
    specification: str | None
    quantity: int
    confidence: float
    source_page: int | None
    source_bbox: list | dict | None
    source_crop_note: str | None
    created_at: datetime


class ConnectivityEdgeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    drawing_id: uuid.UUID
    source_component_id: uuid.UUID
    target_component_id: uuid.UUID
    connection_type: str
    confidence: float
    created_at: datetime


class PidExtractionTriggerResponse(BaseModel):
    task_id: str
    drawing_id: uuid.UUID
    status: str


class BomSummary(BaseModel):
    """Aggregated view: component_type -> total quantity, used for quick BoM review."""

    items: list[BomItemRead]
    quantity_by_type: dict[str, int]
    total_components: int
