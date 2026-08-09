import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ProjectMemberRole = Literal["owner", "member", "viewer", "contributor"]


class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    role: ProjectMemberRole = "member"

    @field_validator("role")
    @classmethod
    def _role_trim(cls, v: str) -> str:
        return v.strip().lower() if isinstance(v, str) else v


class ProjectMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: uuid.UUID
    user_id: uuid.UUID
    role: ProjectMemberRole
    added_by: uuid.UUID
    added_at: datetime

