# Build Plan

## Phase 1: Foundation (Days 1-2)

### 1.1 Project Setup
- [ ] Init Python project: `uv init cbt-backend`
- [ ] Init React project: `npm create vite@latest cbt-ui -- --template react-ts`
- [ ] Create monorepo structure: `/backend`, `/frontend`, `/docs`
- [ ] Add Docker Compose: `docker-compose.yml` with postgres, backend, frontend services
- [ ] Configure `.env.example` with `OPENAI_API_KEY`, `DATABASE_URL`

### 1.2 Database & Persistence
- [ ] Install dependencies: `langgraph`, `langgraph-checkpoint-sqlite`, `langgraph-checkpoint-postgres`
- [ ] Create SQLite checkpointer wrapper for dev
- [ ] Create Session table with SQLAlchemy/SQLModel
- [ ] Test checkpoint save/restore cycle
- [ ] Write `GET /api/resume/:thread_id` endpoint skeleton

### 1.3 Base Agent Structure
- [ ] Define `BlackboardState` TypedDict with all fields
- [ ] Create empty node functions: `supervisor`, `drafter`, `safety_guardian`, `clinical_critic`, `human_gate`, `finalize`
- [ ] Build LangGraph `StateGraph` with nodes registered
- [ ] Add conditional edges (placeholder logic)
- [ ] Compile graph with checkpointer
- [ ] Test: run graph with dummy state, verify checkpoints created

---

## Phase 2: Agent Implementation (Days 3-5)

### 2.1 Drafter Agent
- [ ] Implement prompt template for CBT protocol generation
- [ ] Call LLM with intent + context from blackboard
- [ ] Write output to `current_draft`, append to `drafts[]`
- [ ] Add scratchpad note on completion
- [ ] Test with sample intent

### 2.2 Safety Guardian Agent (CRITICAL PATH)
- [ ] Define safety rules (self-harm keywords, medical advice patterns)
- [ ] Implement LLM-based safety scan with structured output
- [ ] Return `{safety_score, flags[]}` to state
- [ ] Conditional edge: score < 80 → route back to Drafter with flags
- [ ] Test with safe and unsafe drafts
- [ ] Log all safety decisions to scratchpad

### 2.3 Clinical Critic Agent
- [ ] Implement empathy/tone evaluation prompt
- [ ] Return `{empathy_score}` to state
- [ ] Add critique notes to scratchpad
- [ ] Test with varying draft quality

### 2.4 Supervisor Agent
- [ ] Implement routing logic: read scores, decide next step
- [ ] Max iteration check (default: 5)
- [ ] Route to Human Gate when: safety ≥ 80 AND empathy ≥ 70 AND iterations ≥ 1
- [ ] Route to Drafter otherwise with revision instructions
- [ ] Test full loop execution

### 2.5 Interrupt & Human Gate
- [ ] Configure LangGraph `interrupt_before=["human_gate"]`
- [ ] Human Gate node: wait for external input
- [ ] Implement `POST /api/review/:thread_id` to resume graph with decision
- [ ] Handle approve: proceed to Finalize
- [ ] Handle reject: update state with edits, route to Drafter
- [ ] Test interrupt/resume cycle

### 2.6 Finalize Node
- [ ] Save `current_draft` to Session.final_artifact
- [ ] Update Session.status to `approved`
- [ ] Clear sensitive state if needed
- [ ] Return completion signal

---

## Phase 3: API Layer (Days 6-7)

### 3.1 FastAPI Endpoints
- [ ] `POST /api/generate` — create session, start graph async
- [ ] `GET /api/session/:id` — return session with artifact
- [ ] `GET /api/sessions` — paginated list
- [ ] `GET /api/state/:thread_id` — current blackboard from checkpoint
- [ ] `POST /api/review/:thread_id` — human decision input
- [ ] `GET /api/resume/:thread_id` — resume interrupted session
- [ ] `GET /health` — basic health check

### 3.2 WebSocket Streaming
- [ ] Create `/ws/stream/:thread_id` endpoint
- [ ] Hook into LangGraph callbacks to emit events
- [ ] Event types: `node_start`, `node_end`, `state_update`, `interrupt`, `complete`, `error`
- [ ] Test with simple WebSocket client

---

## Phase 4: React Frontend (Days 8-10)

### 4.1 Project Structure
- [ ] Setup Tailwind + shadcn/ui
- [ ] Configure React Router: `/`, `/history`, `/session/:id`, `/review/:thread_id`
- [ ] Create Zustand store for session state
- [ ] Create WebSocket hook with reconnection logic

### 4.2 Dashboard Page
- [ ] Build Intent Input component
- [ ] Build Agent Graph visualization with React Flow
- [ ] Build Live Stream Panel (log viewer)
- [ ] Build State Inspector (JSON tree)
- [ ] Connect WebSocket, update graph nodes on events
- [ ] Test real-time streaming

### 4.3 Human Review Modal
- [ ] Build modal with draft textarea
- [ ] Display safety/empathy scores as badges
- [ ] Approve/Reject buttons call `POST /api/review`
- [ ] Handle loading and error states
- [ ] Test full approve/reject flow

### 4.4 History & Detail Pages
- [ ] Build sessions table with sorting/filtering
- [ ] Build session detail page with timeline
- [ ] Build Review Pending standalone page
- [ ] Test pagination and navigation

---

## Phase 5: MCP Server (Days 11-12)

### 5.1 MCP Implementation
- [ ] Install `mcp-python` SDK
- [ ] Create MCP server entry point
- [ ] Register `create_protocol` tool
- [ ] Tool handler: call same backend logic, return result or pending URL
- [ ] Handle `auto_approve` parameter (with safety warning)

### 5.2 Integration Testing
- [ ] Test with Claude Desktop or MCP inspector
- [ ] Verify tool appears in tool list
- [ ] Test invocation and response format
- [ ] Document MCP usage in README

---

## Phase 6: Polish & Safety Audit (Days 13-14)

### 6.1 Safety Hardening
- [ ] Review Safety Guardian rules—add edge cases
- [ ] Add input sanitization on all endpoints
- [ ] Ensure no PII logged in checkpoints
- [ ] Add rate limiting to `/api/generate` (10/min)
- [ ] Audit error messages—no internal details exposed

### 6.2 Error Handling
- [ ] Backend: global exception handler with structured errors
- [ ] Frontend: error boundaries, toast notifications
- [ ] WebSocket: reconnection with exponential backoff
- [ ] Checkpoint: handle corrupted state gracefully

### 6.3 Testing
- [ ] Unit tests: each agent node with mock LLM
- [ ] Integration test: full graph flow
- [ ] E2E test: Playwright for critical UI flow
- [ ] Load test: 10 concurrent generations

### 6.4 Documentation
- [ ] README with setup instructions
- [ ] API documentation (auto-generated from FastAPI)
- [ ] Architecture diagram
- [ ] MCP integration guide

---

## MVP Checklist

### Must Work
- [ ] User submits intent, agents generate CBT protocol
- [ ] Safety Guardian blocks harmful content (verified with test cases)
- [ ] Graph interrupts for human review
- [ ] Human can edit and approve/reject
- [ ] Approved protocol saved and retrievable
- [ ] Real-time streaming visible in UI
- [ ] Session resumes after crash (checkpoint test)
- [ ] MCP tool callable from external client

### Must Not Happen
- [ ] Unsafe content reaches final artifact
- [ ] Medical advice in output
- [ ] Infinite agent loops (max iterations enforced)
- [ ] Data loss on server restart
- [ ] Unhandled exceptions crash server

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM generates harmful content | Safety Guardian + human review gate |
| Agent loops forever | Max iteration cap (5) + timeout (60s) |
| Checkpoint corruption | Validation on load, fallback to restart |
| WebSocket drops | Client reconnection + state catch-up endpoint |
| MCP misuse | `auto_approve` disabled by default |

---

## Open Questions
1. What's the deployment target—cloud provider preference?
2. Do we need CI/CD pipeline for MVP?
3. Should we add basic analytics (PostHog/Mixpanel) now or later?
4. Who are the test users for UAT?
5. Is there a compliance review needed before production?
