"""add ai_settings table (Syntee Gateway integration)

Revision ID: 0005_ai_settings
Revises: 0004_run_prefs
Create Date: 2026-09-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005_ai_settings"
down_revision: Union[str, None] = "0004_run_prefs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("gateway_url", sa.String(), nullable=False,
                  server_default="https://syntee.fun/v1"),
        sa.Column("text_model", sa.String(), nullable=False, server_default=""),
        sa.Column("vision_model", sa.String(), nullable=False, server_default=""),
        sa.Column("cheap_model", sa.String(), nullable=False, server_default=""),
        sa.Column("embedding_model", sa.String(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("ai_settings")
