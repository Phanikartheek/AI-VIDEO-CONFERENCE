import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime, Float, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.models.base import Base


class TranscriptSegment(Base):
    """A single chunk of transcribed speech within a meeting.

    Populated in real-time by the Whisper moderation pipeline and/or
    any audio worker that processes LiveKit audio tracks.
    """

    __tablename__ = "transcript_segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    speaker_name = Column(String(255), nullable=True)
    timestamp = Column(Float, nullable=False, default=0.0)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    meeting = relationship("Meeting", backref="transcript_segments")

    def __repr__(self):
        return f"<TranscriptSegment meeting={self.meeting_id} speaker={self.speaker_name}>"
