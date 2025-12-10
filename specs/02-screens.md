# Screens & UI

## Screen List

| Screen | URL | Purpose |
|--------|-----|---------|
| Dashboard | `/` | Main workspace; submit intent, watch agents, approve output |
| History | `/history` | View past generated protocols |
| Session Detail | `/session/:id` | View specific session's full trace and final artifact |
| Review Pending | `/review/:thread_id` | Human approval screen (also embedded in Dashboard) |

---

## Screen Details

### Dashboard (`/`)
- **Purpose**: Primary interface for protocol generation and real-time agent observation.
- **Components**:
  - **Intent Input**: Text field + "Generate" button
  - **Agent Graph Visualization**: Node-link diagram showing Supervisor, Drafter, Safety Guardian, Clinical Critic
    - Nodes: Idle (gray), Active (blue pulse), Complete (green), Failed (red)
    - Edges: Show data flow direction
  - **Live Stream Panel**: Scrolling log of agent thoughts/actions (WebSocket feed)
  - **State Inspector**: Collapsible JSON view of current blackboard state
  - **Human Review Modal**: Appears when graph hits interrupt
    - Draft text (editable textarea)
    - Safety Score badge
    - Empathy Score badge
    - "Approve" (green) / "Reject & Revise" (orange) / "Cancel" (red) buttons
- **Actions**:
  - Submit new intent
  - Pause/Resume stream
  - Expand/collapse state inspector
  - Edit and approve/reject draft
- **States**:
  - **Idle**: Empty graph, input focused
  - **Running**: Graph animates, stream populates
  - **Awaiting Review**: Modal visible, graph paused
  - **Complete**: Success banner, link to History
  - **Error**: Error banner with retry option

### History (`/history`)
- **Purpose**: Browse all past sessions and their outcomes.
- **Components**:
  - **Session Table**:
    - Columns: Date, Intent (truncated), Status (Complete/Pending/Failed), Safety Score, Actions
    - Sortable by date, filterable by status
  - **Pagination**: 20 per page
- **Actions**:
  - Click row → navigate to Session Detail
  - Filter by status dropdown
  - Search by intent text
- **States**:
  - **Loading**: Skeleton rows
  - **Empty**: "No sessions yet" message
  - **Loaded**: Table populated

### Session Detail (`/session/:id`)
- **Purpose**: Full audit trail of a single generation session.
- **Components**:
  - **Header**: Intent, Date, Final Status, Scores
  - **Timeline**: Vertical list of checkpoints
    - Each checkpoint: Node name, timestamp, state snapshot (expandable)
  - **Final Artifact Panel**: Rendered CBT protocol (if approved)
  - **Scratchpad Log**: All agent notes from blackboard
- **Actions**:
  - Expand/collapse checkpoint states
  - Copy final artifact to clipboard
  - Re-run with same intent (new session)
- **States**:
  - **Loading**: Spinner
  - **Loaded**: Full content
  - **Not Found**: 404 message

### Review Pending (`/review/:thread_id`)
- **Purpose**: Standalone review page (linked from MCP or email notification).
- **Components**:
  - Same as Human Review Modal but full-page
  - **Context Summary**: Intent, iteration count, agent notes
  - **Draft Editor**: Full-height textarea
  - **Action Buttons**: Approve / Reject / Request Changes (with comment field)
- **Actions**:
  - Edit draft
  - Submit decision
- **States**:
  - **Loading**: Fetching checkpoint
  - **Ready**: Review form visible
  - **Submitted**: Confirmation, redirect to Session Detail
  - **Expired/Invalid**: Error message if thread not found

---

## Design Direction

- **Style**: Clean, clinical, professional. Think medical dashboard meets developer tools.
- **Colors**:
  - Primary: `#2563EB` (blue - trust, calm)
  - Secondary: `#10B981` (green - success, safety)
  - Accent: `#F59E0B` (amber - warnings, attention)
  - Danger: `#EF4444` (red - errors, rejections)
  - Background: `#F9FAFB` (light gray)
  - Surface: `#FFFFFF`
- **Typography**:
  - Headings: Inter (bold)
  - Body: Inter (regular)
  - Code/Logs: JetBrains Mono
- **Iconography**: Lucide React icons
- **Spacing**: 8px base unit, consistent padding

---

## Open Questions

### Answers (Based on Implementation)

1. **Should agent graph visualization be interactive (click node to see details) or display-only?**
   - **Answer**: **Display-only** for MVP. The agent graph uses React Flow to show node status (idle/active/complete/error) with visual indicators and animated edges, but nodes are not clickable. The graph serves as a real-time status indicator. Detailed information is available in the Live Activity panel and State Inspector. Interactive features (click to see details) can be added in future iterations.

2. **Do we need dark mode for MVP?**
   - **Answer**: **No dark mode** for MVP. The UI uses a clean, clinical design with light backgrounds (`#F9FAFB`), white surfaces, and professional color scheme optimized for readability. Dark mode support can be added later if user feedback indicates it's needed.

3. **Should Review Pending page require authentication or use signed URLs?**
   - **Answer**: **No authentication** for MVP. The Review Pending page (`/review/:thread_id`) is accessible via thread_id without authentication. This simplifies the MVP scope and allows easy sharing of review links. For production, signed URLs or authentication should be added for security, but the current implementation prioritizes ease of use and human-in-the-loop workflow.

4. **How much of the blackboard state should be visible to non-technical users?**
   - **Answer**: **Tiered visibility** approach:
     - **Dashboard**: Shows high-level metrics (safety score, empathy score, iteration count) in badges and the State Inspector (collapsible)
     - **State Inspector**: Full JSON view available but collapsed by default, with quick metrics (Safety/Empathy/Iterations) visible when expanded
     - **Review Modal**: Shows only relevant information (draft, scores, agent notes from scratchpad)
     - **Session Detail**: Full audit trail including all scratchpad notes for technical users
   - This balances transparency for debugging while keeping the main UI clean for non-technical users.
