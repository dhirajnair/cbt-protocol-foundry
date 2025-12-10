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
    # Check if we have a human decision
    human_decision = state.get("human_decision")
    
    if human_decision:
        action = human_decision.get("action", "")
        
        if action == "approve":
            # Proceed to finalize
            feedback = human_decision.get("feedback") or ""
            note_message = "Human approved the draft. Proceeding to finalization."
            input_data = (
                f"Draft presented for review:\n{state['current_draft'][:500]}...\n\n"
                f"Safety score: {state.get('safety_score', 0)}/100\n"
                f"Empathy score: {state.get('empathy_score', 0)}/100\n"
                f"Iteration: {state.get('iteration_count', 0)}"
            )
            output_data = (
                "Decision: APPROVED - Proceeding to finalization\n"
                f"Feedback: {feedback[:500] or 'No feedback provided'}"
            )
            scratchpad = add_scratchpad_note(state, "human_gate", note_message, input=input_data, output=output_data)
            
            return {
                "status": DraftStatus.APPROVED.value,
                "next_agent": "finalize",
                "scratchpad": scratchpad,
                "human_decision": None,
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
            input_data = (
                f"Draft presented for review:\n{state['current_draft'][:500]}...\n\n"
                f"Human feedback: {feedback}\n"
                f"Human edits provided: {'Yes' if edits else 'No'}"
            )
            output_data = (
                f"Decision: REJECTED\n"
                f"Feedback: {feedback[:500] or 'No feedback provided'}\n"
                f"Next agent: drafter (with revision instructions)"
            )
            scratchpad = add_scratchpad_note(state, "human_gate", note_message, input=input_data, output=output_data)
            
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
            input_data = f"Session state at cancellation:\nIteration: {state.get('iteration_count', 0)}"
            output_data = "Decision: CANCELLED - Session ended"
            scratchpad = add_scratchpad_note(state, "human_gate", note_message, input=input_data, output=output_data)
            
            return {
                "status": "cancelled",
                "next_agent": "end",
                "scratchpad": scratchpad,
                "human_decision": None,
                "updated_at": datetime.utcnow().isoformat(),
            }
    
    # No decision yet - this state will be returned when graph is interrupted
    # IMPORTANT: Don't set next_agent here - workflow is paused at interrupt
    # The routing function will handle the next step when workflow resumes
    note_message = (
        f"Awaiting human review. "
        f"Current scores - Safety: {state.get('safety_score', 0)}/100, "
        f"Empathy: {state.get('empathy_score', 0)}/100. "
        f"Iteration: {state.get('iteration_count', 0)}/{5}."
    )
    input_data = (
        f"Draft ready for review:\n{state['current_draft'][:500]}...\n\n"
        f"Safety score: {state.get('safety_score', 0)}/100\n"
        f"Empathy score: {state.get('empathy_score', 0)}/100\n"
        f"Iteration: {state.get('iteration_count', 0)}"
    )
    output_data = "Status: Awaiting human decision"
    scratchpad = add_scratchpad_note(state, "human_gate", note_message, input=input_data, output=output_data)
    
    return {
        "status": DraftStatus.REVIEWING.value,
        "scratchpad": scratchpad,
        "updated_at": datetime.utcnow().isoformat(),
    }

