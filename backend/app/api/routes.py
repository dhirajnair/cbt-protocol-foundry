"""API routes for the CBT Protocol Foundry."""
import asyncio
import json
import logging
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
    # Debug logging for outbound WS messages
    try:
        msg_type = message.get("type")
        data = message.get("data", {}) if isinstance(message, dict) else {}
        sp = data.get("scratchpad", [])
        sp_len = len(sp) if isinstance(sp, list) else 0
        status = data.get("status")
        next_agent = data.get("next_agent")
        iteration_count = data.get("iteration_count")
        print(f"[BACKEND LOG] -> broadcast type={msg_type} iter={iteration_count} status={status} next={next_agent} scratchpad_len={sp_len}")
    except Exception:
        pass
    # Normalize message to JSON-serializable (convert datetimes to strings)
    try:
        message = json.loads(json.dumps(message, default=str))
    except Exception as e:
        logging.error(f"[BACKEND LOG] ❌ Failed to normalize WS message for thread {thread_id}: {e}", exc_info=True)
        print(f"[BACKEND LOG] ❌ Failed to normalize WS message for thread {thread_id}: {e}")
        # If normalization fails, fall back to sending the raw message (may still fail)
    if thread_id in active_connections:
        for ws in active_connections[thread_id]:
            try:
                await ws.send_json(message)
            except Exception as e:
                # Log send failures so we know if clients didn't get the message
                logging.error(f"[BACKEND LOG] ❌ Failed to send WS message to thread {thread_id}: {e}", exc_info=True)
                print(f"[BACKEND LOG] ❌ Failed to send WS message to thread {thread_id}: {e}")


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
            
            logging.info(f"[BACKEND LOG] 🚀 Starting workflow for thread {session.thread_id}, intent: {initial_state.get('intent', '')[:50]}")
            print(f"[BACKEND LOG] 🚀 Starting workflow for thread {session.thread_id}")  # stdout fallback
            
            # Stream events - use "values" mode for reliable state updates
            # This streams the full accumulated state after each node execution
            first_event = True
            event_count = 0
            async for event in workflow.astream(initial_state, config, stream_mode="values"):
                event_count += 1
                # Per-event debug
                try:
                    sp = event.get("scratchpad", [])
                    sp_len = len(sp) if isinstance(sp, list) else 0
                    print(f"[BACKEND LOG] 📨 Event #{event_count} for thread {session.thread_id}: "
                          f"status={event.get('status')} next={event.get('next_agent')} "
                          f"iter={event.get('iteration_count')} sp_len={sp_len}")
                except Exception:
                    pass
                # Skip empty events
                if not event:
                    continue
                
                # Get scratchpad from event (full accumulated state)
                scratchpad = event.get("scratchpad", [])
                
                # Skip first event if it's just the initial state (before any nodes run)
                # But only if scratchpad is truly empty - if nodes have run, scratchpad will have entries
                if first_event:
                    first_event = False
                    if not scratchpad:
                        # This is the initial state before any nodes run - skip it
                        logging.info(f"[BACKEND LOG] ⏭️ Skipping initial state event (empty scratchpad) for thread {session.thread_id}")
                        continue
                
                # LOG: State update being broadcast
                iteration_count = event.get("iteration_count", 0)
                status = event.get("status", "")
                next_agent = event.get("next_agent", "")
                
                if scratchpad:
                    latest_note = scratchpad[-1] if scratchpad else {}
                    latest_agent = latest_note.get("agent", "unknown")
                    logging.info(f"[BACKEND LOG] 📤 Broadcasting state_update for thread {session.thread_id}:", {
                        "scratchpad_length": len(scratchpad),
                        "latest_agent": latest_agent,
                        "latest_message": latest_note.get("message", "")[:100] if latest_note else "",
                        "iteration": iteration_count,
                        "status": status,
                        "next_agent": next_agent,
                        "all_agents_in_scratchpad": [n.get("agent") for n in scratchpad],
                    })
                else:
                    logging.warning(f"[BACKEND LOG] ⚠️ Broadcasting state_update with EMPTY scratchpad for thread {session.thread_id}!")
                
                # Broadcast state updates with full accumulated scratchpad
                await broadcast_to_thread(session.thread_id, {
                    "type": "state_update",
                    "data": {
                        "status": status,
                        "next_agent": next_agent,
                        "iteration_count": iteration_count,
                        "safety_score": event.get("safety_score", 0),
                        "empathy_score": event.get("empathy_score", 0),
                        "current_draft": event.get("current_draft", "")[:500],  # Truncate for WS
                        "scratchpad": scratchpad if scratchpad else [],  # ALL accumulated notes
                    }
                })
            
            logging.info(f"[BACKEND LOG] ✅ Workflow stream completed for thread {session.thread_id}, processed {event_count} events")
            print(f"[BACKEND LOG] ✅ Workflow stream completed for thread {session.thread_id}, processed {event_count} events")
            
            # Check final state
            state = await workflow.aget_state(config)
            
            if state.next:  # Graph is paused (at interrupt)
                logging.info(f"[BACKEND LOG] 🛑 Workflow paused at interrupt for thread {session.thread_id}, next node: {state.next[0] if state.next else 'unknown'}")
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
                # Get scratchpad from state to preserve iteration 1 history
                scratchpad = state.values.get("scratchpad", [])
                
                # LOG: Interrupt with scratchpad
                if scratchpad:
                    logging.info(f"[BACKEND LOG] 🛑 Sending interrupt with {len(scratchpad)} scratchpad notes for thread {session.thread_id}")
                    logging.info(f"[BACKEND LOG] Scratchpad agents: {[n.get('agent') for n in scratchpad]}")
                else:
                    logging.warning(f"[BACKEND LOG] ⚠️ Sending interrupt with EMPTY scratchpad for thread {session.thread_id}!")
                
                # Send interrupt with full draft AND scratchpad (not truncated)
                # CRITICAL: Include scratchpad so iteration 1 notes are preserved
                await broadcast_to_thread(session.thread_id, {
                    "type": "interrupt",
                    "data": {
                        "status": "pending_review",
                        "current_draft": state.values.get("current_draft", ""),  # Full draft
                        "safety_score": state.values.get("safety_score", 0),
                        "empathy_score": state.values.get("empathy_score", 0),
                        "iteration_count": state.values.get("iteration_count", 0),
                        "scratchpad": scratchpad if scratchpad else [],  # ALL notes to preserve iteration 1 history
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
            logging.error(f"[BACKEND LOG] ❌ Workflow error for session {session.id}, thread {session.thread_id}: {e}", exc_info=True)
            print(f"[BACKEND LOG] ❌ Workflow error for session {session.id}, thread {session.thread_id}: {e}")  # stdout fallback
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
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting workflow state for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve workflow state")
    
    # Update state with human decision
    human_decision = {
        "action": request.action,
        "edits": request.edits,
        "feedback": request.feedback,
    }
    
    # Get session
    session = session_service.get_by_thread_id(thread_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Update the state with the decision
    await workflow.aupdate_state(
        config,
        {"human_decision": human_decision},
        as_node="human_gate"
    )
    
    # Resume the workflow
    async def resume_workflow():
        try:
            # Stream workflow events - use "values" mode for consistency with initial workflow
            # This streams the full accumulated state after each node execution
            async for event in workflow.astream(None, config, stream_mode="values"):
                # Skip empty events
                if not event:
                    continue
                
                # Get scratchpad from event (full accumulated state)
                scratchpad = event.get("scratchpad", [])
                event_status = event.get("status", "")
                next_agent = event.get("next_agent", "")
                
                # LOG: Resume workflow state update
                iteration_count = event.get("iteration_count", 0)
                if scratchpad:
                    latest_note = scratchpad[-1] if scratchpad else {}
                    latest_agent = latest_note.get("agent", "unknown")
                    logging.info(f"[BACKEND LOG] 🔄 Resume workflow state_update for thread {thread_id}:", {
                        "scratchpad_length": len(scratchpad),
                        "latest_agent": latest_agent,
                        "iteration": iteration_count,
                        "status": event_status,
                        "next_agent": next_agent,
                        "all_agents_in_scratchpad": [n.get("agent") for n in scratchpad],
                    })
                else:
                    logging.warning(f"[BACKEND LOG] ⚠️ Resume workflow state_update with EMPTY scratchpad for thread {thread_id}!")
                
                await broadcast_to_thread(thread_id, {
                    "type": "state_update",
                    "data": {
                        "status": event_status,
                        "next_agent": next_agent,
                        "iteration_count": iteration_count,
                        "safety_score": event.get("safety_score", 0),
                        "empathy_score": event.get("empathy_score", 0),
                        "current_draft": event.get("current_draft", ""),
                        "scratchpad": scratchpad if scratchpad else [],  # ALL accumulated notes to preserve history
                    }
                })
            
                # If rejection and routing to drafter, update session status once
                if request.action == "reject" and next_agent == "drafter" and event_status in ["needs_revision", "running", "drafting"]:
                    session_service.update(
                        session.id,
                        SessionUpdate(
                            status=SessionStatus.RUNNING.value,
                            iteration_count=event.get("iteration_count", 0)
                        )
                    )
                
                # Check if supervisor routed to human_gate - workflow will pause at interrupt
                # Only check when supervisor sets next_agent to human_gate (not on every event)
                if next_agent == "human_gate" and event_status == "reviewing":
                    # Verify workflow paused at interrupt
                    current_state = await workflow.aget_state(config)
                    if current_state.next:
                        next_node = current_state.next[0] if current_state.next else None
                        if next_node == "human_gate":
                            # Workflow paused at human_gate interrupt - break to handle pause
                            logging.info(f"Workflow paused at human_gate interrupt for thread {thread_id} after revision cycle")
                            break
                    # If not paused, log warning but continue (shouldn't happen)
                    else:
                        logging.warning(f"Supervisor routed to human_gate but workflow didn't pause for thread {thread_id}")
            
            # Get final state after streaming completes or pauses
            final_state = await workflow.aget_state(config)
            
            # Check if workflow is paused (at human_gate interrupt)
            if final_state.next:  # Still paused (at interrupt)
                # Check if paused at human_gate (pending review)
                next_node = final_state.next[0] if final_state.next else None
                if next_node == "human_gate":
                    # Workflow paused at human_gate - update to pending_review
                    session_service.update(
                        session.id,
                        SessionUpdate(
                            status=SessionStatus.PENDING_REVIEW.value,
                            iteration_count=final_state.values.get("iteration_count", 0),
                            current_draft=final_state.values.get("current_draft"),
                            safety_score=final_state.values.get("safety_score"),
                            empathy_score=final_state.values.get("empathy_score"),
                        )
                    )
                    interrupt_scratchpad = final_state.values.get("scratchpad", [])
                    await broadcast_to_thread(thread_id, {
                        "type": "interrupt",
                        "data": {
                            "status": "pending_review",
                            "current_draft": final_state.values.get("current_draft", ""),
                            "safety_score": final_state.values.get("safety_score", 0),
                            "empathy_score": final_state.values.get("empathy_score", 0),
                            "iteration_count": final_state.values.get("iteration_count", 0),
                            "scratchpad": interrupt_scratchpad if interrupt_scratchpad else [],
                        }
                    })
                else:
                    # Paused at some other node - keep as running
                    session_service.update(
                        session.id,
                        SessionUpdate(
                            status=SessionStatus.RUNNING.value,
                            iteration_count=final_state.values.get("iteration_count", 0),
                        )
                    )
            else:
                # Graph completed - this should NOT happen after rejection
                # Rejection should always pause at human_gate again
                final_status = final_state.values.get("status", "")
                
                # Only approve if the human actually approved
                if request.action == "approve" and final_status == "approved":
                    session_service.update(
                        session.id,
                        SessionUpdate(
                            status=SessionStatus.APPROVED.value,
                            final_artifact=final_state.values.get("current_draft"),
                            safety_score=final_state.values.get("safety_score"),
                            empathy_score=final_state.values.get("empathy_score"),
                            iteration_count=final_state.values.get("iteration_count", 0),
                        )
                    )
                    await broadcast_to_thread(thread_id, {
                        "type": "complete",
                        "data": {"status": final_status}
                    })
                elif request.action == "cancel":
                    session_service.update(
                        session.id,
                        SessionUpdate(status=SessionStatus.REJECTED.value)
                    )
                    await broadcast_to_thread(thread_id, {
                        "type": "complete",
                        "data": {"status": "rejected"}
                    })
                elif request.action == "reject":
                    # This should not happen - rejection should pause at human_gate
                    # Log detailed error for debugging
                    next_info = final_state.next[0] if final_state.next else "None"
                    logging.error(
                        f"Workflow completed after rejection for thread {thread_id}. "
                        f"Final status: {final_status}, "
                        f"Next node: {next_info}, "
                        f"Iteration: {final_state.values.get('iteration_count', 0)}, "
                        f"Human decision in state: {final_state.values.get('human_decision')}"
                    )
                    # This shouldn't happen with the routing fix
                    # Set status to running and let user resume manually
                    session_service.update(
                        session.id,
                        SessionUpdate(
                            status=SessionStatus.RUNNING.value,
                            iteration_count=final_state.values.get("iteration_count", 0),
                        )
                    )
                    await broadcast_to_thread(thread_id, {
                        "type": "error",
                        "data": {
                            "message": "Workflow completed unexpectedly after rejection. Session set to running state.",
                            "status": "running"
                        }
                    })
                
        except Exception as e:
            error_msg = str(e)
            logging.error(f"Error in workflow resume for thread {thread_id}: {error_msg}", exc_info=True)
            session_service.update(
                session.id,
                SessionUpdate(
                    status=SessionStatus.FAILED.value,
                    error_message=error_msg
                )
            )
            await broadcast_to_thread(thread_id, {
                "type": "error",
                "data": {"message": error_msg}
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
                                "scratchpad": event.get("scratchpad", []),  # ALL notes to preserve history
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

