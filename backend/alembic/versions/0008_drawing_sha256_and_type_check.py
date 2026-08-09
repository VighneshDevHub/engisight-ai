"""add drawings.sha256 column and drawing_type 'requirements' allowlist

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-09

Phase 1 Step 3 additions:
  - drawings.sha256 column (String(64), NOT NULL, indexed). Default is an
    empty string so existing rows remain valid; any new upload via the
    upload endpoint will populate it with the real 64-char hex digest.
  - NOTE: drawing_type is stored as a plain validated string (not a Postgres
    ENUM) so adding "requirements" requires no migration-level ALTER TYPE —
    the restriction lives in app.schemas.drawing.DrawingType and the
    ALLOWED_DRAWING_TYPES set in app.api.v1.endpoints.drawings. We add a
    column-level CHECK constraint here for belt-and-suspenders defense in
    depth.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DRAWING_TYPES = ("baseline", "revision", "pid", "requirements")


def upgrade() -> None:
    op.add_column(
        "drawings",
        sa.Column(
            "sha256",
            sa.String(length=64),
            # Temporary default so existing rows aren't violated; new rows via
            # the API always populate with the real digest.
            server_default="",
            nullable=False,
        ),
    )
    # Drop server_default after add — we don't want future insertions that
    # forget sha256 to silently write an empty string.
    op.alter_column("drawings", "sha256", server_default=None)
    op.create_index("ix_drawings_sha256", "drawings", ["sha256"])

    op.create_check_constraint(
        "ck_drawings_drawing_type_valid",
        "drawings",
        sa.sql.expression.literal_column("drawing_type").in_(DRAWING_TYPES),
    )


def downgrade() -> None:
    op.drop_constraint("ck_drawings_drawing_type_valid", "drawings", type_="check")
    op.drop_index("ix_drawings_sha256", table_name="drawings")
    op.drop_column("drawings", "sha256")
