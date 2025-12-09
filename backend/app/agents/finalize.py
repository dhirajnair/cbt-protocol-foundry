"""Finalize Node - Saves the approved protocol."""
from datetime import datetime

from app.models import BlackboardState, DraftStatus, add_scratchpad_note


async def finalize_node(state: BlackboardState) -> dict:
    """
    Finalize node that marks the protocol as complete.
    
    This is the terminal node after human approval.
    The actual database save happens in the API layer.
    """
    note_message = (
        f"Protocol finalized successfully. "
        f"Final scores - Safety: {state.get('safety_score', 0)}/100, "
        f"Empathy: {state.get('empathy_score', 0)}/100. "
        f"Total iterations: {state.get('iteration_count', 0)}."
    )
    scratchpad = add_scratchpad_note(state, "finalize", note_message)
    
    return {
        "status": DraftStatus.APPROVED.value,
        "next_agent": "end",
        "scratchpad": scratchpad,
        "updated_at": datetime.utcnow().isoformat(),
    }

