"""Drafter Agent - Generates and revises CBT protocols."""
import json
import logging
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.models import BlackboardState, DraftStatus, add_scratchpad_note
from .prompts import DRAFTER_SYSTEM_PROMPT, DRAFTER_TASK_PROMPT, DRAFTER_REVISION_CONTEXT


async def drafter_node(state: BlackboardState) -> dict:
    """
    Drafter agent that generates or revises CBT protocols.
    
    Takes the intent and any revision instructions, produces a new draft.
    """
    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0.7,
    )
    
    # Build revision context if this is a revision
    revision_context = ""
    revision_instructions = state.get("revision_instructions", "")
    if state.get("iteration_count", 0) > 0 and revision_instructions:
        revision_context = DRAFTER_REVISION_CONTEXT.format(
            iteration_count=state["iteration_count"],
            revision_instructions=revision_instructions,
            previous_draft=state.get("current_draft", "") or "No previous draft available",
        )
    
    # Build the task prompt
    task_prompt = DRAFTER_TASK_PROMPT.format(
        intent=state["intent"],
        revision_context=revision_context,
    )
    
    # Call LLM
    messages = [
        SystemMessage(content=DRAFTER_SYSTEM_PROMPT),
        HumanMessage(content=task_prompt),
    ]
    
    response = await llm.ainvoke(messages)
    new_draft = response.content
    
    # Update state
    iteration = state["iteration_count"] + 1
    drafts = state["drafts"] + [new_draft]
    
    # Add note to scratchpad
    revision_instructions = state.get("revision_instructions", "")
    note_message = f"Generated draft version {iteration}. " + (
        f"Addressed: {revision_instructions[:100]}..."
        if revision_instructions
        else "Initial draft created."
    )
    input_data = (
        f"Intent: {state.get('intent', '')}\n"
        f"Iteration: {iteration}\n" +
        (f"Revision instructions: {revision_instructions[:500]}..." if revision_instructions else "Initial draft request")
    )
    output_data = (
        f"Draft version {iteration} generated\n"
        f"Length: {len(new_draft)} characters\n"
        f"Preview: {new_draft[:200]}..."
    )
    scratchpad = add_scratchpad_note(state, "drafter", note_message, input=input_data, output=output_data)
    
    # LOG: Drafter adding scratchpad note
    logging.info(f"[BACKEND LOG] ✍️ Drafter adding scratchpad note:", {
        "scratchpad_length_before": len(state.get("scratchpad", [])),
        "scratchpad_length_after": len(scratchpad),
        "iteration": iteration,
        "draft_length": len(new_draft),
        "is_revision": bool(revision_instructions),
        "message": note_message[:100]
    })
    
    return {
        "current_draft": new_draft,
        "drafts": drafts,
        "iteration_count": iteration,
        "status": DraftStatus.DRAFTING.value,  # Set to drafting during revision
        "scratchpad": scratchpad,
        "revision_instructions": "",  # Clear after using
        "next_agent": "safety_guardian",
        "updated_at": datetime.utcnow().isoformat(),
    }

