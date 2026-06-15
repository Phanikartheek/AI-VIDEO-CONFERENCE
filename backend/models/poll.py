import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime, Boolean, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from backend.models.base import Base


class Poll(Base):
    __tablename__ = "polls"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False, index=True)
    question = Column(String(500), nullable=False)
    options = Column(JSONB, nullable=False)  # array of strings
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closes_at = Column(DateTime(timezone=True), nullable=True)

    meeting = relationship("Meeting", backref="polls")
    votes = relationship("PollVote", back_populates="poll", cascade="all, delete-orphan", lazy="selectin")


class PollVote(Base):
    __tablename__ = "poll_votes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    poll_id = Column(UUID(as_uuid=True), ForeignKey("polls.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    option_index = Column(String(10), nullable=False)
    voted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    poll = relationship("Poll", back_populates="votes")

    __table_args__ = (
        # one vote per user per poll (upsert on change)
    )
