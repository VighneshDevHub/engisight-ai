import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExtractedParameterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    drawing_id: uuid.UUID
    extraction_run_id: uuid.UUID | None
    parameter_name: str
    parameter_value: str
    unit: str | None
    confidence: float
    source_text: str
    source_page: int | None
    source_bbox: list | dict | None
    created_at: datetime


class ExtractionTriggerResponse(BaseModel):
    task_id: str
    drawing_id: uuid.UUID
    status: str


class ExtractionRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    extraction_run_id: uuid.UUID
    drawing_id: uuid.UUID
    run_type: str
    item_count: int
    created_at: datetime

