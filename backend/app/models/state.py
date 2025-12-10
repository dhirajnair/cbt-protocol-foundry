"""Blackboard State and related models for the agent system."""
from datetime import datetime
from enum import Enum
from typing import Annotated, TypedDict
from pydantic import BaseModel, Field
from langgraph.graph.message import add_messages


class Severity(str, Enum):
    """Severity level for safety flags."""
    WARNING = "warning"
    CRITICAL = "critical"


class SessionStatus(str, Enum):
    """Status of a generation session."""
    RUNNING = "running"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    FAILED = "failed"


class DraftStatus(str, Enum):
    """Internal status of the draft in the blackboard."""
    DRAFTING = "drafting"
    REVIEWING = "reviewing"
    APPROVED = "approved"
    NEEDS_REVISION = "needs_revision"


class Note(BaseModel):
    """Agent note in the scratchpad."""
    agent: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    input: str | None = None  # Input data for the agent activity
    output: str | None = None  # Output data from the agent activity


class SafetyFlag(BaseModel):
    """Safety flag for problematic content."""
    line: int
    reason: str
    severity: Severity = Severity.WARNING


class HumanDecision(BaseModel):
    """Human decision on the draft."""
    action: str  # "approve" | "reject" | "edit"
    edits: str | None = None
    feedback: str | None = None


class BlackboardState(TypedDict):
    """
    Shared state object passed between all agents.
    This is the 'blackboard' where agents communicate.
    """
    # Core data
    intent: str
    current_draft: str
    drafts: list[str]
    
    # Agent communication
    scratchpad: list[dict]  # List of Note dicts
    messages: Annotated[list, add_messages]
    
    # Metrics
    safety_score: int
    safety_flags: list[dict]  # List of SafetyFlag dicts
    empathy_score: int
    iteration_count: int
    
    # Control flow
    status: str  # DraftStatus value
    next_agent: str
    revision_instructions: str
    
    # Human interaction
    human_decision: dict | None  # HumanDecision dict
    
    # Metadata
    thread_id: str
    session_id: str
    created_at: str
    updated_at: str


def create_initial_state(
    intent: str,
    thread_id: str,
    session_id: str,
) -> BlackboardState:
    """Create a new initial state for a generation session."""
    now = datetime.utcnow().isoformat()
    return BlackboardState(
        intent=intent,
        current_draft="",
        drafts=[],
        scratchpad=[],
        messages=[],
        safety_score=0,
        safety_flags=[],
        empathy_score=0,
        iteration_count=0,
        status=DraftStatus.DRAFTING.value,
        next_agent="supervisor",
        revision_instructions="",
        human_decision=None,
        thread_id=thread_id,
        session_id=session_id,
        created_at=now,
        updated_at=now,
    )


def add_scratchpad_note(
    state: BlackboardState, 
    agent: str, 
    message: str,
    input: str | None = None,
    output: str | None = None
) -> list[dict]:
    """Add a note to the scratchpad and return updated scratchpad."""
    note = Note(agent=agent, message=message, input=input, output=output)
    return state["scratchpad"] + [note.model_dump()]

