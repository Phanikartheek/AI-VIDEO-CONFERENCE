import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.models.base import Base, TimestampMixin


class Meeting(Base, TimestampMixin):
    __tablename__ = "meetings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False, default="Untitled Meeting")
    host_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    # ─── Public Invite Controls ─────────────────────────────
    public_invite_token_version = Column(Integer, nullable=False, default=1)
    public_invite_active = Column(Boolean, nullable=False, default=False)
    max_participants = Column(Integer, nullable=True)
    require_host_approval = Column(Boolean, nullable=False, default=False)

    # Relationships
    host = relationship("User", back_populates="hosted_meetings", lazy="selectin")
    participants = relationship("Participant", back_populates="meeting", lazy="selectin")
    waiting_room_entries = relationship(
        "WaitingRoomEntry",
        back_populates="meeting",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Meeting {self.id} by {self.host_id}>"
