"""add chat_sessions and chat_messages tables (AI chat with tools)

Revision ID: 0006_chat_tables
Revises: 0005_ai_settings
Create Date: 2026-09-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_chat_tables"
down_revision: Union[str, None] = "0005_ai_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default="Новый чат"),
        sa.Column("model", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index(op.f("ix_chat_sessions_user_id"), "chat_sessions", ["user_id"], unique=False)

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("tool_name", sa.String(), nullable=True),
        sa.Column("tool_payload", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"]),
    )
    op.create_index(op.f("ix_chat_messages_session_id"), "chat_messages", ["session_id"], unique=False)
    op.create_index(op.f("ix_chat_messages_role"), "chat_messages", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_chat_messages_role"), table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_session_id"), table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index(op.f("ix_chat_sessions_user_id"), table_name="chat_sessions")
    op.drop_table("chat_sessions")
