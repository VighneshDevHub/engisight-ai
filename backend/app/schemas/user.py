import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# User role taxonomy — consistent across User.role and ProjectMember.role
# (ProjectMember.role is wider: "owner" / "member" / "viewer" etc., while
#  User.role is a global platform role used by `require_role` dependency).
UserRole = Literal["engineer", "reviewer", "engineering_manager", "admin"]


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("full_name cannot be blank")
        return v.strip()


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
