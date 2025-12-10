# Features & User Stories

## MVP Features

### F1: Multi-Agent CBT Protocol Generator
- **Description**: LangGraph-based agent system that generates safe, empathetic CBT exercises through collaborative agent review.
- **User Story**: As a therapist, I want to request a CBT protocol so that I receive a clinically-vetted, safe exercise for my patient.
- **Acceptance Criteria**:
  - [ ] Accepts user intent (e.g., "Create exposure hierarchy for agoraphobia")
  - [ ] Routes through Supervisor → Drafter → Safety Guardian → Clinical Critic pipeline
  - [ ] Produces structured CBT exercise output
  - [ ] Completes within 60 seconds

### F2: Safety Guardian Agent
- **Description**: Dedicated agent that scans all outputs for self-harm references, medical advice, and unsafe language.
- **User Story**: As a system operator, I want automatic safety checks so that harmful content never reaches end-users.
- **Acceptance Criteria**:
  - [ ] Flags self-harm/suicide references
  - [ ] Blocks medical diagnosis or prescription advice
  - [ ] Returns safety score (0-100) with flagged line numbers
  - [ ] Forces revision loop if score < 80

### F3: Shared Blackboard State
- **Description**: Structured state object shared across agents with scratchpads, version tracking, and metrics.
- **User Story**: As a developer, I want transparent agent communication so that I can debug and audit the reasoning process.
- **Acceptance Criteria**:
  - [ ] JSON state with: context, drafts[], current_draft, safety_score, empathy_score, iteration_count
  - [ ] Agents can append notes to scratchpad
  - [ ] Version history preserved per generation

### F4: Checkpoint Persistence
- **Description**: Every graph step checkpointed to SQLite/Postgres. Resume on crash.
- **User Story**: As a system operator, I want crash recovery so that long-running generations don't lose progress.
- **Acceptance Criteria**:
  - [ ] Uses LangGraph Checkpointer (SqliteSaver or PostgresSaver)
  - [ ] Each node execution persisted before proceeding
  - [ ] Resume API endpoint: `GET /resume/{thread_id}`
  - [ ] Query history: `GET /history`

### F5: React Dashboard (Human-in-the-Loop)
- **Description**: Real-time visualization of agent workflow with mandatory human approval before finalization.
- **User Story**: As a therapist, I want to see agents working and approve/edit the final output so that I maintain clinical control.
- **Acceptance Criteria**:
  - [ ] WebSocket streaming of agent thoughts/actions
  - [ ] Visual graph of agent nodes with status indicators
  - [ ] Interrupt at final node; display draft for review
  - [ ] Edit text area + Approve/Reject buttons
  - [ ] Only approved content saved as final artifact

### F6: MCP Server Interface
- **Description**: Model Context Protocol server exposing the LangGraph workflow as a callable tool.
- **User Story**: As a Claude Desktop user, I want to invoke CBT Foundry via MCP so that I can generate protocols without the web UI.
- **Acceptance Criteria**:
  - [ ] Implements `mcp-python` SDK
  - [ ] Exposes `create_protocol` tool with input: intent (string)
  - [ ] Returns final approved protocol or pending state
  - [ ] Same backend logic as React UI

---

## Future Features
- Multi-user authentication & role-based access
- Protocol template library
- Export to PDF/DOCX
- Analytics dashboard (usage, safety scores over time)
- Fine-tuned clinical LLM integration

---

## User Flows

### Flow 1: Generate Protocol via Dashboard
1. User opens React Dashboard
2. User enters intent: "Create thought record for anxiety"
3. System streams agent activity in real-time
4. Safety Guardian flags line 5; Drafter revises (visible in UI)
5. Graph pauses at "Human Review" node
6. User sees draft, edits line 7, clicks "Approve"
7. System saves final artifact, displays success

### Flow 2: Generate Protocol via MCP
1. User in Claude Desktop prompts: "Ask CBT Foundry to create a sleep hygiene protocol"
2. MCP Client calls CBT Foundry MCP Server `create_protocol` tool
3. Agents run (no streaming UI)
4. If auto-approve enabled: returns result
5. If human-required: returns pending state with review URL

### Flow 3: Resume Interrupted Session
1. Server crashed during generation
2. User hits `GET /resume/{thread_id}`
3. System loads checkpoint, continues from last successful node
4. Completes generation, returns result

---

## Open Questions

### Answers (Based on Implementation)

1. **Should MCP interface support human-in-the-loop, or auto-approve only?**
   - **Answer**: Both modes are supported. The MCP `create_protocol` tool accepts an optional `auto_approve` parameter (default: `False`). When `auto_approve=False`, the workflow pauses at the human gate and returns a `pending_review` status with a review URL. When `auto_approve=True`, it bypasses human review and returns the final protocol directly. This provides flexibility for different use cases while maintaining safety by default.

2. **What's the maximum iteration count before escalating to human?**
   - **Answer**: Maximum iteration count is **5** (configurable via `MAX_ITERATIONS` environment variable, default: 5). When this limit is reached, the Supervisor agent forces routing to the Human Gate regardless of safety/empathy scores, ensuring the workflow doesn't loop indefinitely.

3. **Should Safety Guardian use rule-based checks, LLM-based, or hybrid?**
   - **Answer**: **LLM-based** approach is implemented. The Safety Guardian uses GPT-4o with a specialized system prompt and structured JSON output to analyze drafts. It returns a safety score (0-100) and detailed flags with line numbers and severity levels. The LLM approach provides nuanced understanding of context while maintaining consistency through low temperature (0.1) and structured output parsing.

4. **Do we need audit logging beyond checkpoints for compliance?**
   - **Answer**: Currently, audit logging is provided through:
     - **Checkpoints**: Full state snapshots at each graph step (stored in PostgreSQL)
     - **Session table**: Tracks all sessions with status, scores, and final artifacts
     - **Scratchpad**: Agent notes with timestamps in the blackboard state
     - **WebSocket events**: Real-time activity stream (not persisted)
   - For production compliance, additional structured audit logging may be needed (e.g., separate audit table with user actions, IP addresses, etc.), but the current checkpoint system provides comprehensive traceability for MVP.
