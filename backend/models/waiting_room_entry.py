import enum
import uuid
from sqlalchemy import Column, ForeignKey, DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.models.base import Base


class WaitingRoomStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class WaitingRoomEntry(Base):
    __tablename__ = "waiting_room_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(Enum(WaitingRoomStatus), default=WaitingRoomStatus.PENDING, nullable=False)

    meeting = relationship("Meeting", back_populates="waiting_room_entries")
    user = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<WaitingRoomEntry meeting={self.meeting_id} user={self.user_id} status={self.status}>"
