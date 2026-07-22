"""create extracted_parameters table

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extracted_parameters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("drawing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parameter_name", sa.String(length=255), nullable=False),
        sa.Column("parameter_value", sa.String(length=500), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column("source_bbox", sa.JSON(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["drawing_id"], ["drawings.id"], name="fk_extracted_parameters_drawing_id"
        ),
    )
    op.create_index(
        "ix_extracted_parameters_drawing_id", "extracted_parameters", ["drawing_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_extracted_parameters_drawing_id", table_name="extracted_parameters")
    op.drop_table("extracted_parameters")
