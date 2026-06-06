"""subagents_progress_pricing

Revision ID: 602dae9afc06
Revises: b06a3898e9c0
Create Date: 2026-06-06 16:45:28.645567

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '602dae9afc06'
down_revision: Union[str, None] = 'b06a3898e9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # agent_logs — новые поля суб-агентов
    op.add_column('agent_logs', sa.Column('parent_agent', sa.String(), nullable=True))
    op.add_column('agent_logs', sa.Column('category_context', sa.String(), nullable=True))
    op.create_index(op.f('ix_agent_logs_parent_agent'), 'agent_logs', ['parent_agent'], unique=False)

    # agent_runs — прогресс категорий
    op.add_column('agent_runs', sa.Column('categories_done', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('agent_runs', sa.Column('categories_total', sa.Integer(), nullable=False, server_default='0'))

    # agent_states — суб-агент поля
    op.add_column('agent_states', sa.Column('parent_agent', sa.String(), nullable=True))
    op.add_column('agent_states', sa.Column('category_context', sa.String(), nullable=True))
    op.add_column('agent_states', sa.Column('progress', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('agent_states', sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('agent_states', sa.Column('error_message', sa.Text(), nullable=True))
    op.create_index(op.f('ix_agent_states_parent_agent'), 'agent_states', ['parent_agent'], unique=False)

    # generated_lots — рыночные цены от PricingAgent
    op.add_column('generated_lots', sa.Column('price_min_market', sa.Float(), nullable=True))
    op.add_column('generated_lots', sa.Column('price_max_market', sa.Float(), nullable=True))
    op.add_column('generated_lots', sa.Column('price_avg_market', sa.Float(), nullable=True))
    op.add_column('generated_lots', sa.Column('price_strategy', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('generated_lots', 'price_strategy')
    op.drop_column('generated_lots', 'price_avg_market')
    op.drop_column('generated_lots', 'price_max_market')
    op.drop_column('generated_lots', 'price_min_market')
    op.drop_index(op.f('ix_agent_states_parent_agent'), table_name='agent_states')
    op.drop_column('agent_states', 'error_message')
    op.drop_column('agent_states', 'retry_count')
    op.drop_column('agent_states', 'progress')
    op.drop_column('agent_states', 'category_context')
    op.drop_column('agent_states', 'parent_agent')
    op.drop_column('agent_runs', 'categories_total')
    op.drop_column('agent_runs', 'categories_done')
    op.drop_index(op.f('ix_agent_logs_parent_agent'), table_name='agent_logs')
    op.drop_column('agent_logs', 'category_context')
    op.drop_column('agent_logs', 'parent_agent')
