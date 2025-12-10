"""LangGraph workflow definition for CBT Protocol generation."""
import logging
from typing import Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.base import BaseCheckpointSaver

from app.models import BlackboardState
from app.agents import (
    drafter_node,
    safety_guardian_node,
    clinical_critic_node,
    supervisor_node,
    human_gate_node,
    finalize_node,
)


def route_after_supervisor(state: BlackboardState) -> Literal["drafter", "human_gate"]:
    """Route based on supervisor decision."""
    next_agent = state.get("next_agent", "drafter")
    if next_agent == "human_gate":
        return "human_gate"
    return "drafter"


def route_after_safety(state: BlackboardState) -> Literal["clinical_critic", "supervisor"]:
    """Route based on safety check results."""
    next_agent = state.get("next_agent", "supervisor")
    if next_agent == "clinical_critic":
        return "clinical_critic"
    return "supervisor"


def route_after_human_gate(state: BlackboardState) -> Literal["finalize", "drafter", "__end__"]:
    """Route based on human decision."""
    next_agent = state.get("next_agent", "")
    status = state.get("status", "")
    human_decision = state.get("human_decision")
    
    # If cancelled, end workflow
    if status == "cancelled":
        return END
    
    # If human_decision exists, route based on action
    if human_decision:
        action = human_decision.get("action", "")
        if action == "approve":
            return "finalize"
        elif action == "reject":
            return "drafter"
        elif action == "cancel":
            return END
    
    # If next_agent is explicitly set, use it
    if next_agent == "finalize":
        return "finalize"
    if next_agent == "drafter":
        return "drafter"
    
    # Default: if no decision and no next_agent, this shouldn't happen
    # But if it does, don't route to finalize - workflow should be paused
    # Return drafter as safe default (will cause another cycle)
    logging.warning(f"route_after_human_gate: No human_decision and no next_agent set. Status: {status}")
    return "drafter"  # Safe default - will go through cycle again


def create_workflow(checkpointer: BaseCheckpointSaver | None = None) -> StateGraph:
    """
    Create the CBT Protocol generation workflow.
    
    Graph Structure:
                        ┌─────────────┐
                        │  Supervisor │
                        └──────┬──────┘
                               │
                  ┌────────────┼────────────┐
                  ▼            │            │
            ┌─────────┐        │            │
            │ Drafter │◄───────┘            │
            └────┬────┘                     │
                 │                          │
                 ▼                          │
          ┌──────────┐                      │
          │  Safety  │                      │
          │ Guardian │                      │
          └────┬─────┘                      │
               │                            │
         ┌─────┴─────┐                      │
         ▼           ▼                      │
    (unsafe)    ┌──────────┐                │
       │        │ Clinical │                │
       │        │  Critic  │                │
       │        └────┬─────┘                │
       │             │                      │
       └──────►──────┴──────────────────────┘
                               │
                        ┌──────▼──────┐
                        │ Human Gate  │ ← INTERRUPT
                        └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │  Finalize   │
                        └─────────────┘
    """
    # Create the graph with BlackboardState
    workflow = StateGraph(BlackboardState)
    
    # Add all nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("drafter", drafter_node)
    workflow.add_node("safety_guardian", safety_guardian_node)
    workflow.add_node("clinical_critic", clinical_critic_node)
    workflow.add_node("human_gate", human_gate_node)
    workflow.add_node("finalize", finalize_node)
    
    # Set entry point - always start with supervisor for initial routing
    # First iteration goes: supervisor -> drafter
    workflow.set_entry_point("supervisor")
    
    # Add edges
    # Supervisor routes to drafter (for revision) or human_gate (for approval)
    workflow.add_conditional_edges(
        "supervisor",
        route_after_supervisor,
        {
            "drafter": "drafter",
            "human_gate": "human_gate",
        }
    )
    
    # Drafter always goes to safety guardian
    workflow.add_edge("drafter", "safety_guardian")
    
    # Safety guardian routes to clinical critic (if safe) or supervisor (if unsafe)
    workflow.add_conditional_edges(
        "safety_guardian",
        route_after_safety,
        {
            "clinical_critic": "clinical_critic",
            "supervisor": "supervisor",
        }
    )
    
    # Clinical critic always goes back to supervisor
    workflow.add_edge("clinical_critic", "supervisor")
    
    # Human gate routes to finalize (if approved), drafter (if rejected), or end (if cancelled)
    workflow.add_conditional_edges(
        "human_gate",
        route_after_human_gate,
        {
            "finalize": "finalize",
            "drafter": "drafter",
            END: END,
        }
    )
    
    # Finalize ends the workflow
    workflow.add_edge("finalize", END)
    
    # Compile the graph with interrupt at human_gate
    compiled = workflow.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_gate"],  # Pause before human gate for review
    )
    
    return compiled


# Type alias for the compiled graph
CompiledWorkflow = StateGraph

