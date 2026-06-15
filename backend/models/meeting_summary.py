import uuid
from sqlalchemy import Column, ForeignKey, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from backend.models.base import Base


class MeetingSummary(Base):
    """AI-generated meeting summary with structured outputs.

    Produced by the summarizer worker after a meeting ends.
    """

    __tablename__ = "meeting_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False, unique=True, index=True)

    summary = Column(Text, nullable=False)
    key_points = Column(JSONB, nullable=False, default=list)
    action_items = Column(JSONB, nullable=False, default=list)
    decisions = Column(JSONB, nullable=False, default=list)

    generated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    meeting = relationship("Meeting", backref="summaries")

    def __repr__(self):
        return f"<MeetingSummary meeting={self.meeting_id}>"
