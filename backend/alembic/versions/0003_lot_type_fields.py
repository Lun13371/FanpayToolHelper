"""add lot_type and resell/digital fields to generated_lots

Revision ID: 0003_lot_type_fields
Revises: 602dae9afc06
Create Date: 2026-06-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003_lot_type_fields"
down_revision: Union[str, None] = "602dae9afc06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Тип лота
    op.add_column(
        "generated_lots",
        sa.Column("lot_type", sa.String(), nullable=False, server_default="classic"),
    )
    op.create_index("ix_generated_lots_lot_type", "generated_lots", ["lot_type"])

    # RESELL поля
    op.add_column("generated_lots", sa.Column("resell_source_url", sa.String(), nullable=True))
    op.add_column("generated_lots", sa.Column("resell_source_price", sa.Float(), nullable=True))
    op.add_column("generated_lots", sa.Column("resell_margin_pct", sa.Float(), nullable=True))

    # DIGITAL поля
    op.add_column("generated_lots", sa.Column("digital_content_idea", sa.Text(), nullable=True))
    op.add_column("generated_lots", sa.Column("digital_difficulty", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_index("ix_generated_lots_lot_type", table_name="generated_lots")
    op.drop_column("generated_lots", "lot_type")
    op.drop_column("generated_lots", "resell_source_url")
    op.drop_column("generated_lots", "resell_source_price")
    op.drop_column("generated_lots", "resell_margin_pct")
    op.drop_column("generated_lots", "digital_content_idea")
    op.drop_column("generated_lots", "digital_difficulty")
