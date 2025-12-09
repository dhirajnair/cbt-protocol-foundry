"""Session model for database persistence."""
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel
from uuid import uuid4

from .state import SessionStatus


class Session(SQLModel, table=True):
    """Database model for a generation session."""
    
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    thread_id: str = Field(index=True, unique=True)
    intent: str
    status: str = Field(default=SessionStatus.RUNNING.value)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    final_artifact: Optional[str] = None
    safety_score: Optional[int] = None
    empathy_score: Optional[int] = None
    iteration_count: int = 0
    error_message: Optional[str] = None


class SessionCreate(SQLModel):
    """Schema for creating a new session."""
    intent: str


class SessionUpdate(SQLModel):
    """Schema for updating a session."""
    status: Optional[str] = None
    final_artifact: Optional[str] = None
    safety_score: Optional[int] = None
    empathy_score: Optional[int] = None
    iteration_count: Optional[int] = None
    error_message: Optional[str] = None


class SessionResponse(SQLModel):
    """Schema for session API response."""
    id: str
    thread_id: str
    intent: str
    status: str
    created_at: datetime
    updated_at: datetime
    final_artifact: Optional[str]
    safety_score: Optional[int]
    empathy_score: Optional[int]
    iteration_count: int

