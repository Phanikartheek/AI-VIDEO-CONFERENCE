"""add transcript_segments and meeting_summaries tables

Revision ID: 20260616_transcript_summary
Revises: 20260615_public_invite_controls
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260616_transcript_summary"
down_revision = "20260615_public_invite_controls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transcript_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meetings.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("speaker_name", sa.String(255), nullable=True),
        sa.Column("timestamp", sa.Float, nullable=False, server_default="0"),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transcript_segments_meeting_id", "transcript_segments", ["meeting_id"])

    op.create_table(
        "meeting_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meetings.id"), nullable=False, unique=True),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("key_points", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("action_items", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("decisions", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_meeting_summaries_meeting_id", "meeting_summaries", ["meeting_id"])


def downgrade() -> None:
    op.drop_index("ix_meeting_summaries_meeting_id", table_name="meeting_summaries")
    op.drop_table("meeting_summaries")
    op.drop_index("ix_transcript_segments_meeting_id", table_name="transcript_segments")
    op.drop_table("transcript_segments")
