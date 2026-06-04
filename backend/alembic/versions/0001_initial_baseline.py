"""Initial baseline

Revision ID: 0001_initial_baseline
Revises:
Create Date: 2025-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0001_initial_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Baseline: schema is assumed to already exist (created via init_db/create_all).
    # For new deployments, run `init_db()` first, then `alembic stamp head`.
    pass


def downgrade() -> None:
    pass
