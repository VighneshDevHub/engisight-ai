import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ComparisonCreate(BaseModel):
    baseline_drawing_id: uuid.UUID
    revision_drawing_id: uuid.UUID


class ComparisonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    baseline_drawing_id: uuid.UUID
    revision_drawing_id: uuid.UUID
    status: str
    requested_by: uuid.UUID
    created_at: datetime


class DiffItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    comparison_id: uuid.UUID
    classification: str
    parameter_name: str
    baseline_parameter_id: uuid.UUID | None
    revision_parameter_id: uuid.UUID | None
    baseline_value: str | None
    revision_value: str | None
    match_confidence: float
    explanation: str
    created_at: datetime


class ComparisonSummary(BaseModel):
    comparison: ComparisonRead
    counts: dict[str, int]
    diff_items: list[DiffItemRead]
