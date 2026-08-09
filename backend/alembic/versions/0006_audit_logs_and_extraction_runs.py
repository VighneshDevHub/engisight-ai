"""create audit_logs table + extraction_run_id columns for phase-3a observability

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-04

Changelog:
1. New audit_logs table: every LLM inference call writes a row (via audit_service.py),
   recording provider, model, prompt, response, tokens, latency, cost, trace_id, and
   structured JSON metadata. Satisfies the regulatory engineering requirement that
   all AI-assisted decisions be reproducible and auditable.
2. extraction_run_id (UUID) added to extracted_parameters, bom_items, and
   connectivity_edges. Every re-run of extraction now writes a NEW set of rows with
   a NEW extraction_run_id rather than DELETE-then-INSERT. The latest run per
   drawing_id is considered active; earlier runs are retained so engineers can
   compare extraction versions (e.g. after a model upgrade changes classifications).
   extraction_run_id is NULL for rows inserted before this migration (backfill-safe).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inference_type", sa.String(length=50), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("response", sa.Text(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_cents", sa.Numeric(precision=10, scale=4), nullable=False, server_default="0"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_audit_logs_trace_id", "audit_logs", ["trace_id"])
    op.create_index("ix_audit_logs_provider_model", "audit_logs", ["provider", "model"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.add_column(
        "extracted_parameters",
        sa.Column("extraction_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_extracted_parameters_drawing_run",
        "extracted_parameters",
        ["drawing_id", "extraction_run_id"],
    )

    op.add_column(
        "bom_items",
        sa.Column("extraction_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_bom_items_drawing_run",
        "bom_items",
        ["drawing_id", "extraction_run_id"],
    )

    op.add_column(
        "connectivity_edges",
        sa.Column("extraction_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_connectivity_edges_drawing_run",
        "connectivity_edges",
        ["drawing_id", "extraction_run_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_connectivity_edges_drawing_run", table_name="connectivity_edges")
    op.drop_column("connectivity_edges", "extraction_run_id")

    op.drop_index("ix_bom_items_drawing_run", table_name="bom_items")
    op.drop_column("bom_items", "extraction_run_id")

    op.drop_index("ix_extracted_parameters_drawing_run", table_name="extracted_parameters")
    op.drop_column("extracted_parameters", "extraction_run_id")

    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_provider_model", table_name="audit_logs")
    op.drop_index("ix_audit_logs_trace_id", table_name="audit_logs")
    op.drop_table("audit_logs")
