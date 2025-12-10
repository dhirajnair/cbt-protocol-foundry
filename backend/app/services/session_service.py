"""Session service for managing generation sessions."""
from datetime import datetime
from uuid import uuid4
from typing import Optional
from sqlmodel import Session, select

from app.models import (
    Session as SessionModel,
    SessionCreate,
    SessionUpdate,
    SessionStatus,
)
from app.db import engine


class SessionService:
    """Service for CRUD operations on sessions."""
    
    @staticmethod
    def create(data: SessionCreate) -> SessionModel:
        """Create a new session."""
        thread_id = str(uuid4())
        session = SessionModel(
            id=str(uuid4()),
            thread_id=thread_id,
            intent=data.intent,
            status=SessionStatus.RUNNING.value,
        )
        
        with Session(engine) as db:
            db.add(session)
            db.commit()
            db.refresh(session)
            return session
    
    @staticmethod
    def get_by_id(session_id: str) -> Optional[SessionModel]:
        """Get a session by ID."""
        with Session(engine) as db:
            return db.get(SessionModel, session_id)
    
    @staticmethod
    def get_by_thread_id(thread_id: str) -> Optional[SessionModel]:
        """Get a session by thread_id."""
        with Session(engine) as db:
            statement = select(SessionModel).where(SessionModel.thread_id == thread_id)
            return db.exec(statement).first()
    
    @staticmethod
    def list_all(
        skip: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
    ) -> list[SessionModel]:
        """List all sessions with optional filtering."""
        with Session(engine) as db:
            statement = select(SessionModel).order_by(SessionModel.created_at.desc())
            
            if status:
                statement = statement.where(SessionModel.status == status)
            
            statement = statement.offset(skip).limit(limit)
            return list(db.exec(statement).all())
    
    @staticmethod
    def update(session_id: str, data: SessionUpdate) -> Optional[SessionModel]:
        """Update a session."""
        with Session(engine) as db:
            session = db.get(SessionModel, session_id)
            if not session:
                return None
            
            update_data = data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(session, key, value)
            
            session.updated_at = datetime.utcnow()
            db.add(session)
            db.commit()
            db.refresh(session)
            return session
    
    @staticmethod
    def update_by_thread_id(thread_id: str, data: SessionUpdate) -> Optional[SessionModel]:
        """Update a session by thread_id."""
        with Session(engine) as db:
            statement = select(SessionModel).where(SessionModel.thread_id == thread_id)
            session = db.exec(statement).first()
            if not session:
                return None
            
            update_data = data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(session, key, value)
            
            session.updated_at = datetime.utcnow()
            db.add(session)
            db.commit()
            db.refresh(session)
            return session
    
    @staticmethod
    def count(status: Optional[str] = None) -> int:
        """Count sessions with optional status filter."""
        with Session(engine) as db:
            statement = select(SessionModel)
            if status:
                statement = statement.where(SessionModel.status == status)
            return len(list(db.exec(statement).all()))

    @staticmethod
    def delete(session_id: str) -> bool:
        """Delete a session by ID."""
        with Session(engine) as db:
            session = db.get(SessionModel, session_id)
            if not session:
                return False
            db.delete(session)
            db.commit()
            return True
    
    @staticmethod
    def delete_by_thread_id(thread_id: str) -> bool:
        """Delete a session by thread_id."""
        with Session(engine) as db:
            statement = select(SessionModel).where(SessionModel.thread_id == thread_id)
            session = db.exec(statement).first()
            if not session:
                return False
            db.delete(session)
            db.commit()
            return True


session_service = SessionService()

