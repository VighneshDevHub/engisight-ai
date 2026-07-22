"""create drawings table

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "drawings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_code", sa.String(length=100), nullable=False),
        sa.Column("drawing_number", sa.String(length=100), nullable=False),
        sa.Column("drawing_type", sa.String(length=20), nullable=False),
        sa.Column("original_filename", sa.String(length=500), nullable=False),
        sa.Column("object_key", sa.String(length=1000), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="uploaded"),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], name="fk_drawings_uploaded_by"),
    )
    op.create_index("ix_drawings_project_code", "drawings", ["project_code"])
    op.create_unique_constraint("uq_drawings_object_key", "drawings", ["object_key"])


def downgrade() -> None:
    op.drop_constraint("uq_drawings_object_key", "drawings", type_="unique")
    op.drop_index("ix_drawings_project_code", table_name="drawings")
    op.drop_table("drawings")
