"""Clinical Critic Agent - Evaluates therapeutic quality."""
import json
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.models import BlackboardState, DraftStatus, add_scratchpad_note
from .prompts import CLINICAL_CRITIC_SYSTEM_PROMPT, CLINICAL_CRITIC_TASK_PROMPT


async def clinical_critic_node(state: BlackboardState) -> dict:
    """
    Clinical Critic agent that evaluates therapeutic quality and empathy.
    
    Returns empathy score and quality assessment.
    """
    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0.2,
    )
    
    # Build the task prompt
    task_prompt = CLINICAL_CRITIC_TASK_PROMPT.format(
        draft=state["current_draft"],
    )
    
    # Call LLM
    messages = [
        SystemMessage(content=CLINICAL_CRITIC_SYSTEM_PROMPT),
        HumanMessage(content=task_prompt),
    ]
    
    response = await llm.ainvoke(messages)
    
    # Parse the JSON response
    try:
        content = response.content
        # Handle markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        result = json.loads(content.strip())
        empathy_score = result.get("empathy_score", 0)
        strengths = result.get("strengths", [])
        improvements = result.get("areas_for_improvement", [])
        assessment = result.get("overall_assessment", "")
        appropriateness = result.get("clinical_appropriateness", "needs_adjustment")
    except (json.JSONDecodeError, IndexError):
        # If parsing fails, be moderate
        empathy_score = 60
        strengths = []
        improvements = ["Manual empathy review required"]
        assessment = "Clinical analysis parsing failed"
        appropriateness = "needs_adjustment"
    
    # Build scratchpad note
    note_message = (
        f"Clinical review complete. Empathy: {empathy_score}/100. "
        f"Strengths: {len(strengths)}. Areas to improve: {len(improvements)}. "
        f"Appropriateness: {appropriateness}"
    )
    scratchpad = add_scratchpad_note(state, "clinical_critic", note_message)
    
    # Add improvement notes to revision instructions if empathy is low
    current_instructions = state.get("revision_instructions", "")
    if empathy_score < settings.empathy_threshold:
        empathy_feedback = (
            f"\n\nEMPATHY IMPROVEMENTS NEEDED (Score: {empathy_score}/100)\n"
            f"Areas for improvement:\n" +
            "\n".join([f"- {imp}" for imp in improvements])
        )
        current_instructions = (current_instructions + empathy_feedback).strip()
    
    return {
        "empathy_score": empathy_score,
        "status": DraftStatus.REVIEWING.value,
        "next_agent": "supervisor",
        "scratchpad": scratchpad,
        "revision_instructions": current_instructions,
        "updated_at": datetime.utcnow().isoformat(),
    }

