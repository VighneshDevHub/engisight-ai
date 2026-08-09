"""create projects + project_members + reviews

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("engineering_category", sa.String(length=100), nullable=True),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("ix_projects_code", "projects", ["code"], unique=True)
    op.create_index("ix_projects_created_at", "projects", ["created_at"])

    op.create_table(
        "project_members",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="member"),
        sa.Column("added_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "added_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("project_id", "user_id"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["added_by"], ["users.id"]),
    )
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])

    op.add_column(
        "drawings",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_drawings_project_id", "drawings", ["project_id"])
    op.create_foreign_key("fk_drawings_project_id", "drawings", "projects", ["project_id"], ["id"])

    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("extraction_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decision", sa.String(length=30), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"]),
    )
    op.create_index("ix_reviews_entity_type", "reviews", ["entity_type"])
    op.create_index("ix_reviews_entity_id", "reviews", ["entity_id"])
    op.create_index("ix_reviews_extraction_run_id", "reviews", ["extraction_run_id"])
    op.create_index("ix_reviews_created_at", "reviews", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_reviews_created_at", table_name="reviews")
    op.drop_index("ix_reviews_extraction_run_id", table_name="reviews")
    op.drop_index("ix_reviews_entity_id", table_name="reviews")
    op.drop_index("ix_reviews_entity_type", table_name="reviews")
    op.drop_table("reviews")

    op.drop_constraint("fk_drawings_project_id", "drawings", type_="foreignkey")
    op.drop_index("ix_drawings_project_id", table_name="drawings")
    op.drop_column("drawings", "project_id")

    op.drop_index("ix_project_members_user_id", table_name="project_members")
    op.drop_table("project_members")

    op.drop_index("ix_projects_created_at", table_name="projects")
    op.drop_index("ix_projects_code", table_name="projects")
    op.drop_table("projects")

