# Tech & Data

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 18 + TypeScript | Modern, type-safe, ecosystem maturity |
| UI Framework | Tailwind CSS + shadcn/ui | Rapid styling, consistent components |
| State Management | Zustand | Lightweight, perfect for WebSocket state |
| Graph Visualization | React Flow | Purpose-built for node graphs |
| Backend | Python 3.11 + FastAPI | Async support, LangGraph compatibility |
| Agent Framework | LangGraph | Required per vision; stateful agent orchestration |
| LLM Provider | OpenAI GPT-4o (configurable) | Strong reasoning, safety understanding |
| Database | SQLite (dev) / PostgreSQL (prod) | LangGraph checkpointer support |
| Checkpointer | `langgraph.checkpoint.sqlite` / `langgraph.checkpoint.postgres` | Native LangGraph persistence |
| WebSocket | FastAPI WebSocket + `asyncio` | Real-time streaming |
| MCP SDK | `mcp-python` | Required per vision; machine interface |
| Auth | None (MVP) | Simplify scope; add later |
| Hosting | Docker Compose (local) | Easy dev setup; prod TBD |

---

## Data Model

### Session
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| thread_id | string | LangGraph thread identifier |
| intent | string | User's input prompt |
| status | enum | `running`, `pending_review`, `approved`, `rejected`, `failed` |
| created_at | datetime | Timestamp |
| updated_at | datetime | Last state change |
| final_artifact | text | Approved CBT protocol (nullable) |

### Checkpoint (LangGraph-managed)
| Field | Type | Notes |
|-------|------|-------|
| thread_id | string | Links to Session |
| checkpoint_id | string | LangGraph internal |
| parent_id | string | Previous checkpoint |
| checkpoint | JSONB | Full graph state blob |
| metadata | JSONB | Node info, timestamp |

### BlackboardState (in-memory / checkpointed)
| Field | Type | Notes |
|-------|------|-------|
| intent | string | Original user request |
| current_draft | string | Latest protocol text |
| drafts | list[string] | Version history |
| scratchpad | list[Note] | Agent notes `{agent, message, timestamp}` |
| safety_score | int | 0-100 |
| safety_flags | list[Flag] | `{line, reason}` |
| empathy_score | int | 0-100 |
| iteration_count | int | Loop counter |
| status | enum | `drafting`, `reviewing`, `approved`, `needs_revision` |

### Note (embedded in BlackboardState)
| Field | Type | Notes |
|-------|------|-------|
| agent | string | Agent name |
| message | string | Note content |
| timestamp | datetime | When written |

### Flag (embedded in BlackboardState)
| Field | Type | Notes |
|-------|------|-------|
| line | int | Line number in draft |
| reason | string | Why flagged |
| severity | enum | `warning`, `critical` |

---

## Relationships

```
Session 1:1 Thread (thread_id)
Thread 1:N Checkpoints (LangGraph manages)
Checkpoint contains BlackboardState snapshot
```

---

## Key API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/generate` | Start new protocol generation; returns `{session_id, thread_id}` |
| GET | `/api/session/:id` | Get session details + final artifact |
| GET | `/api/sessions` | List all sessions (paginated) |
| GET | `/api/resume/:thread_id` | Resume interrupted session |
| POST | `/api/review/:thread_id` | Submit human decision `{action: approve|reject, edits?: string}` |
| WS | `/ws/stream/:thread_id` | WebSocket for real-time agent events |
| GET | `/api/state/:thread_id` | Get current blackboard state from checkpoint |
| GET | `/health` | Health check |

---

## Agent Graph Structure

```
                    ┌─────────────┐
                    │  Supervisor │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌──────────┐  ┌──────────┐
        │ Drafter │  │  Safety  │  │ Clinical │
        │         │  │ Guardian │  │  Critic  │
        └────┬────┘  └────┬─────┘  └────┬─────┘
             │            │             │
             └────────────┴─────────────┘
                           │
                    ┌──────▼──────┐
                    │ Human Gate  │ ← INTERRUPT
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Finalize   │
                    └─────────────┘
```

**Nodes**:
- `Supervisor`: Routes tasks, decides iteration vs. finalize
- `Drafter`: Generates/revises CBT protocol text
- `Safety Guardian`: Scans for harmful content, returns scores/flags
- `Clinical Critic`: Evaluates empathy, tone, clinical appropriateness
- `Human Gate`: Interrupts graph, waits for human input
- `Finalize`: Saves approved artifact, marks complete

**Edges** (conditional):
- Supervisor → Drafter (always first)
- Drafter → Safety Guardian
- Safety Guardian → Clinical Critic (if safe) OR → Drafter (if unsafe, loop)
- Clinical Critic → Supervisor (for decision)
- Supervisor → Human Gate (if ready) OR → Drafter (more iterations)
- Human Gate → Finalize (if approved) OR → Drafter (if rejected with edits)

**Flow Logic**:

| From | To | Condition |
|------|----|-----------|
| Supervisor | Drafter | Always first, or revision needed |
| Drafter | Safety Guardian | After draft created |
| Safety Guardian | Clinical Critic | `safety_score ≥ 80` |
| Safety Guardian | Drafter | `safety_score < 80` (unsafe loop) |
| Clinical Critic | Supervisor | Always (returns evaluation) |
| Supervisor | Human Gate | `safety ≥ 80` AND `empathy ≥ 70` AND `iterations ≥ 1` |
| Supervisor | Drafter | More iterations needed (max 5) |
| Human Gate | Finalize | Human approved |
| Human Gate | Drafter | Human rejected with edits |

**Safety Loops**:
1. **Safety loop**: Guardian → Drafter (unsafe content forces revision)
2. **Quality loop**: Supervisor → Drafter (low empathy/quality forces revision)
3. **Human loop**: Human Gate → Drafter (rejection forces revision)

---

## MCP Server Config

```python
# Exposed tools
tools = [
    {
        "name": "create_protocol",
        "description": "Generate a CBT protocol using CBT Foundry's agent system",
        "input_schema": {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "description": "CBT exercise request"},
                "auto_approve": {"type": "boolean", "default": False}
            },
            "required": ["intent"]
        }
    }
]
```

---

## Open Questions

### Answers (Based on Implementation)

1. **Should checkpoints be pruned after N days to save storage?**
   - **Answer**: **Not implemented for MVP**. Checkpoints are stored indefinitely in PostgreSQL. For production, a cleanup job should be added to prune checkpoints older than a configurable retention period (e.g., 30-90 days), while preserving session metadata and final artifacts. This is a future enhancement.

2. **GPT-4o vs Claude for agents—do we need to abstract LLM calls?**
   - **Answer**: **GPT-4o is used** (configurable via `OPENAI_MODEL` env var, default: `gpt-4o`). LLM calls are made directly via `langchain-openai.ChatOpenAI` without abstraction. For MVP, this is sufficient. If multi-provider support is needed later, an abstraction layer (e.g., LangChain's LLM interface) can be added, but it's not required for the current implementation.

3. **Should Safety Guardian run synchronously or as background validator?**
   - **Answer**: **Synchronously** in the main workflow. The Safety Guardian is a node in the LangGraph workflow that runs before Clinical Critic. It must complete before the workflow proceeds, ensuring safety checks happen in real-time. This guarantees unsafe content is caught before human review, which is critical for the safety-first design.

4. **Do we need rate limiting on `/api/generate` for MVP?**
   - **Answer**: **Not implemented for MVP**. Rate limiting is mentioned in the build plan but not yet implemented. For production, rate limiting should be added (e.g., 10 requests/minute per IP) to prevent abuse and manage API costs. FastAPI middleware or a library like `slowapi` can be used.

5. **How to handle MCP `auto_approve=True` safely—require explicit config flag?**
   - **Answer**: **Parameter-based with default safety**. The MCP `create_protocol` tool accepts `auto_approve` as an optional boolean parameter (default: `False`). When `auto_approve=True`, the workflow bypasses the human gate interrupt. The parameter is clearly documented with a warning ("Use with caution"). For additional safety, a server-level config flag could require explicit enablement, but the current implementation relies on the caller's explicit choice.
