import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

DrawingType = Literal["baseline", "revision", "pid", "requirements"]
DrawingStatus = Literal["uploaded", "processing", "processed", "failed"]


class DrawingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_code: str
    project_id: uuid.UUID | None = None
    drawing_number: str
    drawing_type: DrawingType
    original_filename: str
    content_type: str
    file_size_bytes: int
    sha256: str
    status: DrawingStatus
    uploaded_by: uuid.UUID
    created_at: datetime
    # Internal MinIO/S3 object key. Surfaces in test / dedup verification;
    # the download URL endpoint is how real users fetch the bytes.
    object_key: str | None = None


class DrawingDownloadURL(BaseModel):
    url: str
    expires_in_seconds: int
