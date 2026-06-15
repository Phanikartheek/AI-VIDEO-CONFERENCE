import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime, func, Float, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from backend.models.base import Base, TimestampMixin


class MeetingReport(Base, TimestampMixin):
    """Per-participant engagement report persisted when a meeting ends.

    Each row = one participant's aggregated metrics for a single meeting.
    """

    __tablename__ = "meeting_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    participant_name = Column(String(255), nullable=True)

    # Final aggregate engagement score (0-100)
    avg_score = Column(Float, nullable=False, default=0.0)

    # Per-signal breakdown (0-100 each)
    video_score = Column(Float, nullable=False, default=0.0)
    mic_score = Column(Float, nullable=False, default=0.0)
    typing_score = Column(Float, nullable=False, default=0.0)
    chat_score = Column(Float, nullable=False, default=0.0)

    # Number of 10s samples received
    sample_count = Column(Integer, nullable=False, default=0)

    # Full breakdown JSON for flexibility
    breakdown = Column(JSONB, nullable=True)

    # Relationships
    meeting = relationship("Meeting", backref="reports")
    user = relationship("User", backref="reports")

    def __repr__(self):
        return f"<MeetingReport meeting={self.meeting_id} user={self.user_id} score={self.avg_score}>"
