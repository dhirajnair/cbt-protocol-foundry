"""Safety Guardian Agent - Scans for harmful content."""
import json
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.models import BlackboardState, DraftStatus, Severity, add_scratchpad_note
from .prompts import SAFETY_GUARDIAN_SYSTEM_PROMPT, SAFETY_GUARDIAN_TASK_PROMPT


async def safety_guardian_node(state: BlackboardState) -> dict:
    """
    Safety Guardian agent that scans drafts for harmful content.
    
    Returns safety score and flags any problematic content.
    """
    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0.1,  # Low temperature for consistent safety analysis
    )
    
    # Build the task prompt
    task_prompt = SAFETY_GUARDIAN_TASK_PROMPT.format(
        draft=state["current_draft"],
    )
    
    # Call LLM
    messages = [
        SystemMessage(content=SAFETY_GUARDIAN_SYSTEM_PROMPT),
        HumanMessage(content=task_prompt),
    ]
    
    response = await llm.ainvoke(messages)
    
    # Parse the JSON response
    try:
        # Try to extract JSON from the response
        content = response.content
        # Handle markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        result = json.loads(content.strip())
        safety_score = result.get("safety_score", 0)
        flags = result.get("flags", [])
        assessment = result.get("overall_assessment", "")
        recommendations = result.get("recommendations", [])
    except (json.JSONDecodeError, IndexError):
        # If parsing fails, be conservative
        safety_score = 50
        flags = [{"line": 0, "reason": "Could not parse safety analysis", "severity": "warning"}]
        assessment = "Safety analysis parsing failed - manual review required"
        recommendations = ["Manual safety review required"]
    
    # Determine next step based on safety score
    if safety_score < settings.safety_threshold:
        status = DraftStatus.NEEDS_REVISION.value
        next_agent = "supervisor"  # Supervisor will route back to drafter
    else:
        status = DraftStatus.REVIEWING.value
        next_agent = "clinical_critic"
    
    # Build scratchpad note
    note_message = (
        f"Safety scan complete. Score: {safety_score}/100. "
        f"Flags: {len(flags)}. "
        f"Assessment: {assessment[:100]}..."
    )
    input_data = (
        f"Draft to analyze:\n{state['current_draft'][:1000]}..."
    )
    output_data = (
        f"Safety score: {safety_score}/100\n"
        f"Flags found: {len(flags)}\n" +
        (f"Flags:\n" + "\n".join([f"- Line {f.get('line', '?')}: {f.get('reason', 'Unknown')} [{f.get('severity', 'warning')}]" for f in flags[:5]]) if flags else "No flags") +
        f"\n\nAssessment: {assessment[:300]}..." +
        (f"\n\nRecommendations:\n" + "\n".join([f"- {r}" for r in recommendations[:3]]) if recommendations else "")
    )
    scratchpad = add_scratchpad_note(state, "safety_guardian", note_message, input=input_data, output=output_data)
    
    # Build revision instructions if needed
    revision_instructions = ""
    if safety_score < settings.safety_threshold:
        revision_instructions = (
            f"SAFETY ISSUES DETECTED (Score: {safety_score}/100)\n\n"
            f"Flags:\n" +
            "\n".join([f"- Line {f.get('line', '?')}: {f.get('reason', 'Unknown')} [{f.get('severity', 'warning')}]" 
                      for f in flags]) +
            f"\n\nRecommendations:\n" +
            "\n".join([f"- {r}" for r in recommendations])
        )
    
    return {
        "safety_score": safety_score,
        "safety_flags": flags,
        "status": status,
        "next_agent": next_agent,
        "scratchpad": scratchpad,
        "revision_instructions": revision_instructions or state.get("revision_instructions", ""),
        "updated_at": datetime.utcnow().isoformat(),
    }

