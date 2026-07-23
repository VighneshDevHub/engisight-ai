"""create bom_items and connectivity_edges tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bom_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("drawing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("component_type", sa.String(length=255), nullable=False),
        sa.Column("tag", sa.String(length=100), nullable=True),
        sa.Column("specification", sa.String(length=500), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column("source_bbox", sa.JSON(), nullable=True),
        sa.Column("source_crop_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["drawing_id"], ["drawings.id"], name="fk_bom_items_drawing_id"),
    )
    op.create_index("ix_bom_items_drawing_id", "bom_items", ["drawing_id"])

    op.create_table(
        "connectivity_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("drawing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_component_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_component_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("connection_type", sa.String(length=50), nullable=False, server_default="pipe"),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["drawing_id"], ["drawings.id"], name="fk_connectivity_edges_drawing_id"
        ),
        sa.ForeignKeyConstraint(
            ["source_component_id"], ["bom_items.id"], name="fk_connectivity_edges_source"
        ),
        sa.ForeignKeyConstraint(
            ["target_component_id"], ["bom_items.id"], name="fk_connectivity_edges_target"
        ),
    )
    op.create_index("ix_connectivity_edges_drawing_id", "connectivity_edges", ["drawing_id"])


def downgrade() -> None:
    op.drop_index("ix_connectivity_edges_drawing_id", table_name="connectivity_edges")
    op.drop_table("connectivity_edges")
    op.drop_index("ix_bom_items_drawing_id", table_name="bom_items")
    op.drop_table("bom_items")
