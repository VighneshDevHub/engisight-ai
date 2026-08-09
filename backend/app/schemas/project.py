import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ProjectCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    engineering_category: str | None = None
    deadline: date | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    engineering_category: str | None = None
    deadline: date | None = None
    status: str | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    description: str | None
    status: str
    engineering_category: str | None
    deadline: date | None
    created_by: uuid.UUID
    created_at: datetime

