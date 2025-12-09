"""Supervisor Agent - Routes tasks and decides next steps."""
import json
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.models import BlackboardState, DraftStatus, add_scratchpad_note
from .prompts import SUPERVISOR_SYSTEM_PROMPT, SUPERVISOR_TASK_PROMPT


async def supervisor_node(state: BlackboardState) -> dict:
    """
    Supervisor agent that coordinates the workflow.
    
    Decides whether to revise, proceed to human review, or escalate.
    """
    # Get recent scratchpad notes for context
    recent_notes = state.get("scratchpad", [])[-5:]  # Last 5 notes
    notes_text = "\n".join([
        f"- [{n.get('agent', 'unknown')}]: {n.get('message', '')}"
        for n in recent_notes
    ]) if recent_notes else "No notes yet."
    
    # Format safety flags
    safety_flags = state.get("safety_flags", [])
    flags_text = "\n".join([
        f"- Line {f.get('line', '?')}: {f.get('reason', 'Unknown')} [{f.get('severity', 'warning')}]"
        for f in safety_flags
    ]) if safety_flags else "No flags."
    
    # Check iteration limit first
    if state["iteration_count"] >= settings.max_iterations:
        # Force to human review regardless of scores
        note_message = f"Max iterations ({settings.max_iterations}) reached. Routing to human review."
        scratchpad = add_scratchpad_note(state, "supervisor", note_message)
        
        return {
            "status": DraftStatus.REVIEWING.value,
            "next_agent": "human_gate",
            "scratchpad": scratchpad,
            "updated_at": datetime.utcnow().isoformat(),
        }
    
    # Check if scores meet thresholds
    safety_score = state.get("safety_score", 0)
    empathy_score = state.get("empathy_score", 0)
    
    # Simple rule-based decision (can use LLM for complex cases)
    if safety_score >= settings.safety_threshold and empathy_score >= settings.empathy_threshold:
        # Good to go to human review
        note_message = (
            f"Quality checks passed. Safety: {safety_score}/100, Empathy: {empathy_score}/100. "
            f"Routing to human review."
        )
        scratchpad = add_scratchpad_note(state, "supervisor", note_message)
        
        return {
            "status": DraftStatus.REVIEWING.value,
            "next_agent": "human_gate",
            "scratchpad": scratchpad,
            "updated_at": datetime.utcnow().isoformat(),
        }
    
    # Needs revision - compile instructions
    revision_reasons = []
    if safety_score < settings.safety_threshold:
        revision_reasons.append(f"Safety score ({safety_score}) below threshold ({settings.safety_threshold})")
    if empathy_score < settings.empathy_threshold:
        revision_reasons.append(f"Empathy score ({empathy_score}) below threshold ({settings.empathy_threshold})")
    
    # Use existing revision instructions or build new ones
    revision_instructions = state.get("revision_instructions", "")
    if not revision_instructions:
        revision_instructions = (
            f"REVISION REQUIRED\n"
            f"Iteration: {state['iteration_count']}/{settings.max_iterations}\n"
            f"Reasons: {', '.join(revision_reasons)}\n\n"
            f"Please address the following issues in your revision."
        )
    
    note_message = (
        f"Revision required. {', '.join(revision_reasons)}. "
        f"Iteration {state['iteration_count']}/{settings.max_iterations}."
    )
    scratchpad = add_scratchpad_note(state, "supervisor", note_message)
    
    return {
        "status": DraftStatus.NEEDS_REVISION.value,
        "next_agent": "drafter",
        "revision_instructions": revision_instructions,
        "scratchpad": scratchpad,
        "updated_at": datetime.utcnow().isoformat(),
    }

