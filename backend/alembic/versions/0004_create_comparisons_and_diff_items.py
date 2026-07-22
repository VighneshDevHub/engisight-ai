"""create comparisons and diff_items tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "comparisons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("baseline_drawing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("revision_drawing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["baseline_drawing_id"], ["drawings.id"], name="fk_comparisons_baseline_drawing_id"
        ),
        sa.ForeignKeyConstraint(
            ["revision_drawing_id"], ["drawings.id"], name="fk_comparisons_revision_drawing_id"
        ),
        sa.ForeignKeyConstraint(
            ["requested_by"], ["users.id"], name="fk_comparisons_requested_by"
        ),
    )

    op.create_table(
        "diff_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("comparison_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classification", sa.String(length=20), nullable=False),
        sa.Column("parameter_name", sa.String(length=255), nullable=False),
        sa.Column("baseline_parameter_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("revision_parameter_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("baseline_value", sa.String(length=500), nullable=True),
        sa.Column("revision_value", sa.String(length=500), nullable=True),
        sa.Column("match_confidence", sa.Float(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["comparison_id"], ["comparisons.id"], name="fk_diff_items_comparison_id"
        ),
        sa.ForeignKeyConstraint(
            ["baseline_parameter_id"],
            ["extracted_parameters.id"],
            name="fk_diff_items_baseline_parameter_id",
        ),
        sa.ForeignKeyConstraint(
            ["revision_parameter_id"],
            ["extracted_parameters.id"],
            name="fk_diff_items_revision_parameter_id",
        ),
    )
    op.create_index("ix_diff_items_comparison_id", "diff_items", ["comparison_id"])


def downgrade() -> None:
    op.drop_index("ix_diff_items_comparison_id", table_name="diff_items")
    op.drop_table("diff_items")
    op.drop_table("comparisons")
