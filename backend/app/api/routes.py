"""API routes for the CBT Protocol Foundry."""
import asyncio
import json
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel

from app.config import settings
from app.models import (
    BlackboardState,
    SessionCreate,
    SessionResponse,
    SessionStatus,
    SessionUpdate,
    create_initial_state,
)
from app.services import session_service
from app.db import get_checkpointer
from app.graph import create_workflow


router = APIRouter()


# Request/Response models
class GenerateRequest(BaseModel):
    """Request to start a new protocol generation."""
    intent: str


class GenerateResponse(BaseModel):
    """Response after starting generation."""
    session_id: str
    thread_id: str
    status: str


class ReviewRequest(BaseModel):
    """Request to submit a human review decision."""
    action: str  # "approve" | "reject" | "cancel"
    edits: Optional[str] = None
    feedback: Optional[str] = None


class StateResponse(BaseModel):
    """Current state response."""
    thread_id: str
    intent: str
    current_draft: str
    safety_score: int
    empathy_score: int
    iteration_count: int
    status: str
    scratchpad: list


class SessionListResponse(BaseModel):
    """Paginated list of sessions."""
    items: list[SessionResponse]
    total: int
    page: int
    per_page: int


# Store for active WebSocket connections
active_connections: dict[str, list[WebSocket]] = {}


async def broadcast_to_thread(thread_id: str, message: dict):
    """Broadcast a message to all WebSocket connections for a thread."""
    if thread_id in active_connections:
        for ws in active_connections[thread_id]:
            try:
                await ws.send_json(message)
            except Exception:
                pass  # Connection might be closed


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@router.post("/api/generate", response_model=GenerateResponse)
async def generate_protocol(request: GenerateRequest):
    """
    Start a new CBT protocol generation.
    
    This creates a new session and starts the agent workflow.
    The workflow will run until it reaches the human_gate interrupt.
    """
    # Create session
    session = session_service.create(SessionCreate(intent=request.intent))
    
    # Create initial state
    initial_state = create_initial_state(
        intent=request.intent,
        thread_id=session.thread_id,
        session_id=session.id,
    )
    
    # Get checkpointer and create workflow
    checkpointer = await get_checkpointer()
    workflow = create_workflow(checkpointer)
    
    # Run the workflow in background
    async def run_workflow():
        try:
            config = {"configurable": {"thread_id": session.thread_id}}
            
            # Stream events
            async for event in workflow.astream(initial_state, config, stream_mode="values"):
                # Broadcast state updates
                await broadcast_to_thread(session.thread_id, {
                    "type": "state_update",
                    "data": {
                        "status": event.get("status", ""),
                        "next_agent": event.get("next_agent", ""),
                        "iteration_count": event.get("iteration_count", 0),
                        "safety_score": event.get("safety_score", 0),
                        "empathy_score": event.get("empathy_score", 0),
                        "current_draft": event.get("current_draft", "")[:500],  # Truncate for WS
                        "scratchpad": event.get("scratchpad", [])[-5:],  # Last 5 notes
                    }
                })
            
            # Check final state
            state = await workflow.aget_state(config)
            
            if state.next:  # Graph is paused (at interrupt)
                # Update session to pending review
                session_service.update(
                    session.id,
                    SessionUpdate(
                        status=SessionStatus.PENDING_REVIEW.value,
                        safety_score=state.values.get("safety_score"),
                        empathy_score=state.values.get("empathy_score"),
                        iteration_count=state.values.get("iteration_count", 0),
                    )
                )
                # Send interrupt with full draft (not truncated)
                await broadcast_to_thread(session.thread_id, {
                    "type": "interrupt",
                    "data": {
                        "status": "pending_review",
                        "current_draft": state.values.get("current_draft", ""),  # Full draft
                        "safety_score": state.values.get("safety_score", 0),
                        "empathy_score": state.values.get("empathy_score", 0),
                        "iteration_count": state.values.get("iteration_count", 0),
                    }
                })
            else:
                # Graph completed (shouldn't happen without human approval)
                final_status = state.values.get("status", SessionStatus.FAILED.value)
                session_service.update(
                    session.id,
                    SessionUpdate(
                        status=final_status,
                        final_artifact=state.values.get("current_draft"),
                        safety_score=state.values.get("safety_score"),
                        empathy_score=state.values.get("empathy_score"),
                        iteration_count=state.values.get("iteration_count", 0),
                    )
                )
                await broadcast_to_thread(session.thread_id, {
                    "type": "complete",
                    "data": {"status": final_status}
                })
                
        except Exception as e:
            # Update session as failed
            session_service.update(
                session.id,
                SessionUpdate(
                    status=SessionStatus.FAILED.value,
                    error_message=str(e)
                )
            )
            await broadcast_to_thread(session.thread_id, {
                "type": "error",
                "data": {"message": str(e)}
            })
    
    # Start workflow in background
    asyncio.create_task(run_workflow())
    
    return GenerateResponse(
        session_id=session.id,
        thread_id=session.thread_id,
        status=SessionStatus.RUNNING.value,
    )


@router.get("/api/session/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get a specific session by ID."""
    session = session_service.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/api/sessions", response_model=SessionListResponse)
async def list_sessions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
):
    """List all sessions with pagination."""
    skip = (page - 1) * per_page
    sessions = session_service.list_all(skip=skip, limit=per_page, status=status)
    total = session_service.count(status=status)
    
    return SessionListResponse(
        items=sessions,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/api/state/{thread_id}", response_model=StateResponse)
async def get_state(thread_id: str):
    """Get the current state from checkpoint."""
    checkpointer = await get_checkpointer()
    workflow = create_workflow(checkpointer)
    
    config = {"configurable": {"thread_id": thread_id}}
    
    try:
        state = await workflow.aget_state(config)
        if not state.values:
            raise HTTPException(status_code=404, detail="State not found")
        
        return StateResponse(
            thread_id=thread_id,
            intent=state.values.get("intent", ""),
            current_draft=state.values.get("current_draft", ""),
            safety_score=state.values.get("safety_score", 0),
            empathy_score=state.values.get("empathy_score", 0),
            iteration_count=state.values.get("iteration_count", 0),
            status=state.values.get("status", ""),
            scratchpad=state.values.get("scratchpad", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/review/{thread_id}")
async def submit_review(thread_id: str, request: ReviewRequest):
    """
    Submit a human review decision.
    
    This resumes the graph from the human_gate interrupt.
    """
    checkpointer = await get_checkpointer()
    workflow = create_workflow(checkpointer)
    
    config = {"configurable": {"thread_id": thread_id}}
    
    # Get current state
    try:
        state = await workflow.aget_state(config)
        if not state.values:
            raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Update state with human decision
    human_decision = {
        "action": request.action,
        "edits": request.edits,
        "feedback": request.feedback,
    }
    
    # Update the state with the decision
    await workflow.aupdate_state(
        config,
        {"human_decision": human_decision},
        as_node="human_gate"
    )
    
    # Get session
    session = session_service.get_by_thread_id(thread_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Resume the workflow
    async def resume_workflow():
        try:
            async for event in workflow.astream(None, config, stream_mode="values"):
                await broadcast_to_thread(thread_id, {
                    "type": "state_update",
                    "data": {
                        "status": event.get("status", ""),
                        "next_agent": event.get("next_agent", ""),
                        "iteration_count": event.get("iteration_count", 0),
                        "safety_score": event.get("safety_score", 0),
                        "empathy_score": event.get("empathy_score", 0),
                    }
                })
            
            # Get final state
            final_state = await workflow.aget_state(config)
            
            if final_state.next:  # Still paused (another review needed)
                session_service.update(
                    session.id,
                    SessionUpdate(
                        status=SessionStatus.PENDING_REVIEW.value,
                        iteration_count=final_state.values.get("iteration_count", 0),
                    )
                )
                await broadcast_to_thread(thread_id, {
                    "type": "interrupt",
                    "data": {"status": "pending_review"}
                })
            else:
                # Graph completed
                final_status = final_state.values.get("status", "")
                if final_status == "approved":
                    session_service.update(
                        session.id,
                        SessionUpdate(
                            status=SessionStatus.APPROVED.value,
                            final_artifact=final_state.values.get("current_draft"),
                        )
                    )
                elif request.action == "cancel":
                    session_service.update(
                        session.id,
                        SessionUpdate(status=SessionStatus.REJECTED.value)
                    )
                
                await broadcast_to_thread(thread_id, {
                    "type": "complete",
                    "data": {"status": final_status}
                })
                
        except Exception as e:
            session_service.update(
                session.id,
                SessionUpdate(
                    status=SessionStatus.FAILED.value,
                    error_message=str(e)
                )
            )
            await broadcast_to_thread(thread_id, {
                "type": "error",
                "data": {"message": str(e)}
            })
    
    # Start resume in background
    asyncio.create_task(resume_workflow())
    
    return {"status": "resuming", "thread_id": thread_id}


@router.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session by ID."""
    success = session_service.delete(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "session_id": session_id}


@router.delete("/api/session/thread/{thread_id}")
async def delete_session_by_thread(thread_id: str):
    """Delete a session by thread_id."""
    success = session_service.delete_by_thread_id(thread_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "thread_id": thread_id}


@router.get("/api/resume/{thread_id}")
async def resume_session(thread_id: str):
    """
    Resume an interrupted session.
    
    Used to recover from crashes - continues from last checkpoint.
    """
    session = session_service.get_by_thread_id(thread_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    checkpointer = await get_checkpointer()
    workflow = create_workflow(checkpointer)
    
    config = {"configurable": {"thread_id": thread_id}}
    
    # Get current state
    try:
        state = await workflow.aget_state(config)
        if not state.values:
            raise HTTPException(status_code=404, detail="No checkpoint found")
        
        # If there's a next node and status is running/pending_review, resume workflow
        can_resume = bool(state.next) and session.status in [SessionStatus.RUNNING.value, SessionStatus.PENDING_REVIEW.value]
        
        if can_resume and state.next:
            # Resume workflow in background
            async def resume_workflow():
                try:
                    async for event in workflow.astream(None, config, stream_mode="values"):
                        await broadcast_to_thread(thread_id, {
                            "type": "state_update",
                            "data": {
                                "status": event.get("status", ""),
                                "current_draft": event.get("current_draft", ""),
                                "safety_score": event.get("safety_score", 0),
                                "empathy_score": event.get("empathy_score", 0),
                                "iteration_count": event.get("iteration_count", 0),
                                "next_agent": event.get("next_agent"),
                                "scratchpad": event.get("scratchpad", [])[-5:],
                            }
                        })
                        
                        if event.get("status") in ["approved", "rejected", "failed"]:
                            await broadcast_to_thread(thread_id, {
                                "type": "complete",
                                "data": {"status": event.get("status")}
                            })
                            break
                except Exception as e:
                    await broadcast_to_thread(thread_id, {
                        "type": "error",
                        "data": {"message": str(e)}
                    })
            
            asyncio.create_task(resume_workflow())
        
        return {
            "status": "found",
            "thread_id": thread_id,
            "session_id": session.id,
            "current_status": session.status,
            "can_resume": can_resume,
            "next_node": state.next[0] if state.next else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/stream/{thread_id}")
async def websocket_stream(websocket: WebSocket, thread_id: str):
    """
    WebSocket endpoint for real-time streaming of agent events.
    """
    await websocket.accept()
    
    # Add to active connections
    if thread_id not in active_connections:
        active_connections[thread_id] = []
    active_connections[thread_id].append(websocket)
    
    try:
        # Send initial state
        checkpointer = await get_checkpointer()
        workflow = create_workflow(checkpointer)
        config = {"configurable": {"thread_id": thread_id}}
        
        try:
            state = await workflow.aget_state(config)
            if state.values:
                await websocket.send_json({
                    "type": "initial_state",
                    "data": {
                        "intent": state.values.get("intent", ""),
                        "status": state.values.get("status", ""),
                        "current_draft": state.values.get("current_draft", ""),
                        "safety_score": state.values.get("safety_score", 0),
                        "empathy_score": state.values.get("empathy_score", 0),
                        "iteration_count": state.values.get("iteration_count", 0),
                        "scratchpad": state.values.get("scratchpad", []),
                        "is_paused": bool(state.next),
                    }
                })
        except Exception:
            pass  # No state yet
        
        # Keep connection alive and listen for messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle ping/pong or other client messages
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat"})
            except WebSocketDisconnect:
                break
                
    finally:
        # Remove from active connections
        if thread_id in active_connections:
            active_connections[thread_id].remove(websocket)
            if not active_connections[thread_id]:
                del active_connections[thread_id]

