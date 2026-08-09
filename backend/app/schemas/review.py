import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReviewCreate(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    extraction_run_id: uuid.UUID | None = None
    decision: str
    comment: str | None = None


class ReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    extraction_run_id: uuid.UUID | None
    decision: str
    comment: str | None
    reviewer_id: uuid.UUID
    created_at: datetime


class LatestReviewBatchRequest(BaseModel):
    entity_type: str
    entity_ids: list[uuid.UUID]
    extraction_run_id: uuid.UUID | None = None


class LatestReviewBatchResponse(BaseModel):
    entity_type: str
    reviews_by_entity_id: dict[uuid.UUID, ReviewRead | None]

