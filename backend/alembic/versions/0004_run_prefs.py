"""add analysis prefs to agent_runs

Revision ID: 0004_run_prefs
Revises: 0003_lot_type_fields
Create Date: 2026-06-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_run_prefs"
down_revision: Union[str, None] = "0003_lot_type_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("lot_types",         sa.String(),  nullable=False, server_default="classic,digital,resell,service"))
    op.add_column("agent_runs", sa.Column("focus_mode",        sa.String(),  nullable=False, server_default="balanced"))
    op.add_column("agent_runs", sa.Column("price_strategy",    sa.String(),  nullable=False, server_default="auto"))
    op.add_column("agent_runs", sa.Column("min_margin_pct",    sa.Float(),   nullable=False, server_default="10.0"))
    op.add_column("agent_runs", sa.Column("generate_seo",      sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("agent_runs", sa.Column("prefer_no_account", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("agent_runs", sa.Column("max_price",         sa.Float(),   nullable=True))
    op.add_column("agent_runs", sa.Column("min_competition",   sa.Integer(), nullable=True))


def downgrade() -> None:
    for col in ["lot_types", "focus_mode", "price_strategy", "min_margin_pct",
                "generate_seo", "prefer_no_account", "max_price", "min_competition"]:
        op.drop_column("agent_runs", col)
