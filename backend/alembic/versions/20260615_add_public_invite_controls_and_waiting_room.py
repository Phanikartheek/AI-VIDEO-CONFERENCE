"""add public invite controls and waiting room

Revision ID: 20260615_public_invite_controls
Revises: 
Create Date: 2026-06-15

Note:
    This repository currently bootstraps tables with SQLAlchemy's
    Base.metadata.create_all() in app startup. This Alembic migration file is
    provided so the schema change is explicit and portable for teams that use
    Alembic in real deployments.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260615_public_invite_controls"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("public_invite_token_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "meetings",
        sa.Column("public_invite_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "meetings",
        sa.Column("max_participants", sa.Integer(), nullable=True),
    )
    op.add_column(
        "meetings",
        sa.Column("require_host_approval", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    waiting_status = sa.Enum("pending", "approved", "rejected", name="waitingroomstatus")
    waiting_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "waiting_room_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meetings.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("status", waiting_status, nullable=False, server_default="pending"),
    )
    op.create_index("ix_waiting_room_entries_meeting_id", "waiting_room_entries", ["meeting_id"])
    op.create_index("ix_waiting_room_entries_user_id", "waiting_room_entries", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_waiting_room_entries_user_id", table_name="waiting_room_entries")
    op.drop_index("ix_waiting_room_entries_meeting_id", table_name="waiting_room_entries")
    op.drop_table("waiting_room_entries")

    waiting_status = sa.Enum("pending", "approved", "rejected", name="waitingroomstatus")
    waiting_status.drop(op.get_bind(), checkfirst=True)

    op.drop_column("meetings", "require_host_approval")
    op.drop_column("meetings", "max_participants")
    op.drop_column("meetings", "public_invite_active")
    op.drop_column("meetings", "public_invite_token_version")
