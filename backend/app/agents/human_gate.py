"""Human Gate Node - Interrupts for human review."""
from datetime import datetime

from app.models import BlackboardState, DraftStatus, add_scratchpad_note


async def human_gate_node(state: BlackboardState) -> dict:
    """
    Human Gate node that pauses execution for human review.
    
    This node is configured as an interrupt point in the graph.
    When reached, the graph pauses and waits for human input.
    
    The human can:
    - Approve: Proceed to finalize
    - Reject with edits: Go back to drafter
    - Cancel: End the session
    """
    note_message = (
        f"Awaiting human review. "
        f"Current scores - Safety: {state.get('safety_score', 0)}/100, "
        f"Empathy: {state.get('empathy_score', 0)}/100. "
        f"Iteration: {state.get('iteration_count', 0)}/{5}."
    )
    scratchpad = add_scratchpad_note(state, "human_gate", note_message)
    
    # Check if we have a human decision
    human_decision = state.get("human_decision")
    
    if human_decision:
        action = human_decision.get("action", "")
        
        if action == "approve":
            # Proceed to finalize
            note_message = "Human approved the draft. Proceeding to finalization."
            scratchpad = add_scratchpad_note(state, "human_gate", note_message)
            
            return {
                "status": DraftStatus.APPROVED.value,
                "next_agent": "finalize",
                "scratchpad": scratchpad,
                "updated_at": datetime.utcnow().isoformat(),
            }
        
        elif action == "reject":
            # Go back to drafter with edits
            edits = human_decision.get("edits", "")
            feedback = human_decision.get("feedback", "")
            
            revision_instructions = (
                f"HUMAN FEEDBACK:\n"
                f"{feedback}\n\n"
                f"EDITED DRAFT TO USE AS BASE:\n"
                f"{edits}" if edits else ""
            ).strip()
            
            note_message = f"Human rejected the draft. Feedback: {feedback[:100]}..."
            scratchpad = add_scratchpad_note(state, "human_gate", note_message)
            
            # Update current draft with edits if provided
            current_draft = edits if edits else state["current_draft"]
            
            return {
                "current_draft": current_draft,
                "status": DraftStatus.NEEDS_REVISION.value,
                "next_agent": "drafter",
                "revision_instructions": revision_instructions,
                "human_decision": None,  # Clear decision
                "scratchpad": scratchpad,
                "updated_at": datetime.utcnow().isoformat(),
            }
        
        elif action == "cancel":
            note_message = "Human cancelled the session."
            scratchpad = add_scratchpad_note(state, "human_gate", note_message)
            
            return {
                "status": "cancelled",
                "next_agent": "end",
                "scratchpad": scratchpad,
                "updated_at": datetime.utcnow().isoformat(),
            }
    
    # No decision yet - this state will be returned when graph is interrupted
    return {
        "status": DraftStatus.REVIEWING.value,
        "scratchpad": scratchpad,
        "updated_at": datetime.utcnow().isoformat(),
    }

