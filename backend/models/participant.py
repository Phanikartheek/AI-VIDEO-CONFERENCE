import uuid
import enum
from sqlalchemy import Column, String, ForeignKey, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.models.base import Base


class ParticipantRole(str, enum.Enum):
    HOST = "host"
    CO_HOST = "co_host"
    PARTICIPANT = "participant"
    VIEWER = "viewer"


class Participant(Base):
    __tablename__ = "participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role = Column(Enum(ParticipantRole), default=ParticipantRole.PARTICIPANT, nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("User", back_populates="participations")

    def __repr__(self):
        return f"<Participant {self.user_id} in {self.meeting_id} as {self.role}>"
