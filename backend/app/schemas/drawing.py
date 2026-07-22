import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DrawingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_code: str
    drawing_number: str
    drawing_type: str
    original_filename: str
    content_type: str
    file_size_bytes: int
    status: str
    uploaded_by: uuid.UUID
    created_at: datetime


class DrawingDownloadURL(BaseModel):
    url: str
    expires_in_seconds: int
