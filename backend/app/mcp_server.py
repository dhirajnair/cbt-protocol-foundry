"""MCP Server for CBT Protocol Foundry."""
import asyncio
import json
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from app.config import settings
from app.models import SessionCreate, create_initial_state, SessionStatus
from app.services import session_service
from app.db import init_db, get_checkpointer
from app.graph import create_workflow


# Create MCP server
server = Server("cerina-foundry")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        Tool(
            name="create_protocol",
            description="Generate a CBT (Cognitive Behavioral Therapy) protocol using Cerina's multi-agent system. The protocol will go through safety and clinical review before returning.",
            inputSchema={
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string",
                        "description": "The CBT exercise or protocol request (e.g., 'Create an exposure hierarchy for social anxiety')",
                    },
                    "auto_approve": {
                        "type": "boolean",
                        "description": "If true, automatically approve the protocol without human review. Use with caution.",
                        "default": False,
                    },
                },
                "required": ["intent"],
            },
        ),
        Tool(
            name="get_protocol_status",
            description="Check the status of a protocol generation session.",
            inputSchema={
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "The session ID returned from create_protocol",
                    },
                },
                "required": ["session_id"],
            },
        ),
        Tool(
            name="list_protocols",
            description="List recent CBT protocols that have been generated.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of protocols to return",
                        "default": 10,
                    },
                    "status": {
                        "type": "string",
                        "description": "Filter by status (approved, pending_review, running, failed)",
                        "enum": ["approved", "pending_review", "running", "failed"],
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    
    if name == "create_protocol":
        return await handle_create_protocol(arguments)
    elif name == "get_protocol_status":
        return await handle_get_status(arguments)
    elif name == "list_protocols":
        return await handle_list_protocols(arguments)
    else:
        return [TextContent(type="text", text=f"Unknown tool: {name}")]


async def handle_create_protocol(arguments: dict) -> list[TextContent]:
    """Handle create_protocol tool call."""
    intent = arguments.get("intent", "")
    auto_approve = arguments.get("auto_approve", False)
    
    if not intent:
        return [TextContent(type="text", text="Error: intent is required")]
    
    # Initialize database
    init_db()
    
    # Create session
    session = session_service.create(SessionCreate(intent=intent))
    
    # Create initial state
    initial_state = create_initial_state(
        intent=intent,
        thread_id=session.thread_id,
        session_id=session.id,
    )
    
    # If auto_approve, add a pre-approved decision
    if auto_approve:
        initial_state["human_decision"] = {
            "action": "approve",
            "edits": None,
            "feedback": "Auto-approved via MCP",
        }
    
    # Get checkpointer and create workflow
    checkpointer = await get_checkpointer()
    
    # For auto_approve, don't use interrupt
    if auto_approve:
        from langgraph.graph import StateGraph, END
        from app.models import BlackboardState
        from app.agents import (
            drafter_node,
            safety_guardian_node,
            clinical_critic_node,
            supervisor_node,
            human_gate_node,
            finalize_node,
        )
        from app.graph.workflow import (
            route_after_supervisor,
            route_after_safety,
            route_after_human_gate,
        )
        
        # Create workflow without interrupt
        workflow = StateGraph(BlackboardState)
        workflow.add_node("supervisor", supervisor_node)
        workflow.add_node("drafter", drafter_node)
        workflow.add_node("safety_guardian", safety_guardian_node)
        workflow.add_node("clinical_critic", clinical_critic_node)
        workflow.add_node("human_gate", human_gate_node)
        workflow.add_node("finalize", finalize_node)
        
        workflow.set_entry_point("supervisor")
        workflow.add_conditional_edges("supervisor", route_after_supervisor)
        workflow.add_edge("drafter", "safety_guardian")
        workflow.add_conditional_edges("safety_guardian", route_after_safety)
        workflow.add_edge("clinical_critic", "supervisor")
        workflow.add_conditional_edges("human_gate", route_after_human_gate)
        workflow.add_edge("finalize", END)
        
        compiled = workflow.compile(checkpointer=checkpointer)
    else:
        compiled = create_workflow(checkpointer)
    
    config = {"configurable": {"thread_id": session.thread_id}}
    
    try:
        # Run the workflow
        final_state = None
        async for event in compiled.astream(initial_state, config, stream_mode="values"):
            final_state = event
        
        # Get final state
        state = await compiled.aget_state(config)
        
        if state.next and not auto_approve:
            # Graph is paused for human review
            session_service.update(
                session.id,
                {
                    "status": SessionStatus.PENDING_REVIEW.value,
                    "safety_score": state.values.get("safety_score"),
                    "empathy_score": state.values.get("empathy_score"),
                    "iteration_count": state.values.get("iteration_count", 0),
                }
            )
            
            result = {
                "status": "pending_review",
                "session_id": session.id,
                "thread_id": session.thread_id,
                "message": "Protocol generated and awaiting human review",
                "review_url": f"http://localhost:5173/review/{session.thread_id}",
                "preview": {
                    "draft": state.values.get("current_draft", "")[:1000],
                    "safety_score": state.values.get("safety_score", 0),
                    "empathy_score": state.values.get("empathy_score", 0),
                    "iterations": state.values.get("iteration_count", 0),
                },
            }
        else:
            # Graph completed
            final_draft = state.values.get("current_draft", "") if state.values else ""
            
            session_service.update(
                session.id,
                {
                    "status": SessionStatus.APPROVED.value,
                    "final_artifact": final_draft,
                    "safety_score": state.values.get("safety_score") if state.values else 0,
                    "empathy_score": state.values.get("empathy_score") if state.values else 0,
                }
            )
            
            result = {
                "status": "approved",
                "session_id": session.id,
                "thread_id": session.thread_id,
                "protocol": final_draft,
                "metrics": {
                    "safety_score": state.values.get("safety_score", 0) if state.values else 0,
                    "empathy_score": state.values.get("empathy_score", 0) if state.values else 0,
                    "iterations": state.values.get("iteration_count", 0) if state.values else 0,
                },
            }
        
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
        
    except Exception as e:
        session_service.update(
            session.id,
            {"status": SessionStatus.FAILED.value, "error_message": str(e)}
        )
        return [TextContent(type="text", text=f"Error generating protocol: {str(e)}")]


async def handle_get_status(arguments: dict) -> list[TextContent]:
    """Handle get_protocol_status tool call."""
    session_id = arguments.get("session_id", "")
    
    if not session_id:
        return [TextContent(type="text", text="Error: session_id is required")]
    
    init_db()
    session = session_service.get_by_id(session_id)
    
    if not session:
        return [TextContent(type="text", text=f"Session not found: {session_id}")]
    
    result = {
        "session_id": session.id,
        "thread_id": session.thread_id,
        "intent": session.intent,
        "status": session.status,
        "created_at": session.created_at.isoformat(),
        "safety_score": session.safety_score,
        "empathy_score": session.empathy_score,
        "iteration_count": session.iteration_count,
    }
    
    if session.final_artifact:
        result["protocol"] = session.final_artifact
    
    if session.status == SessionStatus.PENDING_REVIEW.value:
        result["review_url"] = f"http://localhost:5173/review/{session.thread_id}"
    
    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def handle_list_protocols(arguments: dict) -> list[TextContent]:
    """Handle list_protocols tool call."""
    limit = arguments.get("limit", 10)
    status = arguments.get("status")
    
    init_db()
    sessions = session_service.list_all(limit=limit, status=status)
    
    result = {
        "count": len(sessions),
        "protocols": [
            {
                "session_id": s.id,
                "intent": s.intent[:100] + "..." if len(s.intent) > 100 else s.intent,
                "status": s.status,
                "created_at": s.created_at.isoformat(),
                "safety_score": s.safety_score,
                "empathy_score": s.empathy_score,
            }
            for s in sessions
        ],
    }
    
    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())

