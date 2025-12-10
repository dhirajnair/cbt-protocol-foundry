"""Drafter Agent - Generates and revises CBT protocols."""
import json
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
    if state["iteration_count"] > 0 and state["revision_instructions"]:
        revision_context = DRAFTER_REVISION_CONTEXT.format(
            iteration_count=state["iteration_count"],
            revision_instructions=state["revision_instructions"],
            previous_draft=state["current_draft"] or "No previous draft available",
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
    note_message = f"Generated draft version {iteration}. " + (
        f"Addressed: {state['revision_instructions'][:100]}..."
        if state["revision_instructions"]
        else "Initial draft created."
    )
    input_data = (
        f"Intent: {state['intent']}\n"
        f"Iteration: {iteration}\n" +
        (f"Revision instructions: {state['revision_instructions'][:500]}..." if state["revision_instructions"] else "Initial draft request")
    )
    output_data = (
        f"Draft version {iteration} generated\n"
        f"Length: {len(new_draft)} characters\n"
        f"Preview: {new_draft[:200]}..."
    )
    scratchpad = add_scratchpad_note(state, "drafter", note_message, input=input_data, output=output_data)
    
    return {
        "current_draft": new_draft,
        "drafts": drafts,
        "iteration_count": iteration,
        "status": DraftStatus.REVIEWING.value,
        "scratchpad": scratchpad,
        "revision_instructions": "",  # Clear after using
        "next_agent": "safety_guardian",
        "updated_at": datetime.utcnow().isoformat(),
    }

