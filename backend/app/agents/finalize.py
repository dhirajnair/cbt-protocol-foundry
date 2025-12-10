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
    input_data = (
        f"Approved draft to finalize:\n{state['current_draft'][:500]}...\n\n"
        f"Final scores:\n"
        f"Safety: {state.get('safety_score', 0)}/100\n"
        f"Empathy: {state.get('empathy_score', 0)}/100\n"
        f"Total iterations: {state.get('iteration_count', 0)}"
    )
    output_data = (
        f"Protocol finalized and saved\n"
        f"Final artifact length: {len(state.get('current_draft', ''))} characters"
    )
    scratchpad = add_scratchpad_note(state, "finalize", note_message, input=input_data, output=output_data)
    
    return {
        "status": DraftStatus.APPROVED.value,
        "next_agent": "end",
        "scratchpad": scratchpad,
        "updated_at": datetime.utcnow().isoformat(),
    }

