# Cerina - CBT Protocol Foundry

A multi-agent AI system for generating safe, empathetic Cognitive Behavioral Therapy (CBT) protocols.

## Architecture

```
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
```

## Features

- **Multi-Agent System**: Supervisor, Drafter, Safety Guardian, Clinical Critic agents
- **Safety-First**: Automatic safety scoring and revision loops
- **Human-in-the-Loop**: Mandatory human review before finalizing
- **Real-time Streaming**: WebSocket-based live agent activity visualization
- **Checkpoint Persistence**: Resume interrupted sessions from LangGraph checkpoints
- **MCP Integration**: Expose as a tool for Claude Desktop and other MCP clients

## Tech Stack

### Backend
- Python 3.11+
- FastAPI
- LangGraph
- LangChain + OpenAI
- PostgreSQL
- MCP SDK

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components
- React Flow (agent visualization)
- Zustand (state management)

---

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+ (recommended: use conda)
- Node.js 20+
- Docker (for PostgreSQL)
- OpenAI API key

### Step 1: Clone and Setup Environment

```bash
# Clone the repository
cd cbt-protocol-foundry

# Create conda environment with Python 3.11
conda create -n cbt python=3.11 -y
conda activate cbt
```

### Step 2: Start PostgreSQL (Docker)

```bash
# Start PostgreSQL container
docker run -d \
  --name cerina-postgres \
  -e POSTGRES_USER=cerina \
  -e POSTGRES_PASSWORD=cerina \
  -e POSTGRES_DB=cerina \
  -p 5432:5432 \
  postgres:16-alpine

# Verify it's running
docker ps
```

### Step 3: Install Backend Dependencies

```bash
cd backend

# Install all dependencies
pip install fastapi "uvicorn[standard]" langgraph langchain langchain-openai \
    sqlmodel aiosqlite python-dotenv websockets pydantic httpx \
    pydantic-settings langgraph-checkpoint-postgres "psycopg[binary,pool]" mcp

# Create .env file from example
cp env.example .env

# Edit .env and add your OpenAI API key
# nano .env  (or use your preferred editor)
```

### Step 4: Start Backend Server

```bash
# Make sure you're in the backend directory with conda env activated
conda activate cbt
cd backend

# Set your OpenAI API key (or add to .env file)
export OPENAI_API_KEY=sk-your-key-here

# Start the FastAPI server
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

You should see:
```
🚀 Starting Cerina Backend...
✅ Database tables created
✅ LangGraph checkpointer initialized
✅ All systems ready
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### Step 5: Install Frontend Dependencies

```bash
# Open a new terminal
cd frontend

# Install dependencies
npm install
```

### Step 6: Start Frontend Server

```bash
cd frontend
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### Step 7: Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

---

## Docker Compose (All Services)

For running all services together:

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-your-key-here

# Start all services (PostgreSQL, Backend, Frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Required
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional (defaults shown)
OPENAI_MODEL=gpt-4o
DATABASE_URL=postgresql://cerina:cerina@localhost:5432/cerina
HOST=0.0.0.0
PORT=8000
MCP_PORT=8001
MAX_ITERATIONS=5
SAFETY_THRESHOLD=80
EMPATHY_THRESHOLD=70
GENERATION_TIMEOUT=60
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Start new protocol generation |
| GET | `/api/session/:id` | Get session details |
| GET | `/api/sessions` | List all sessions (paginated) |
| GET | `/api/state/:thread_id` | Get current checkpoint state |
| POST | `/api/review/:thread_id` | Submit human review decision |
| GET | `/api/resume/:thread_id` | Resume interrupted session |
| WS | `/ws/stream/:thread_id` | Real-time agent events |
| GET | `/health` | Health check |

---

## MCP Integration

The system exposes an MCP server with the `create_protocol` tool.

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cerina": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/path/to/cbt-protocol-foundry/backend",
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here",
        "DATABASE_URL": "postgresql://cerina:cerina@localhost:5432/cerina"
      }
    }
  }
}
```

### Usage in Claude Desktop

> "Ask Cerina to create a sleep hygiene protocol"

---

## Project Structure

```
cbt-protocol-foundry/
├── backend/
│   ├── app/
│   │   ├── agents/          # Agent implementations
│   │   │   ├── drafter.py
│   │   │   ├── safety_guardian.py
│   │   │   ├── clinical_critic.py
│   │   │   ├── supervisor.py
│   │   │   ├── human_gate.py
│   │   │   └── finalize.py
│   │   ├── api/             # FastAPI routes
│   │   ├── db/              # Database setup
│   │   ├── graph/           # LangGraph workflow
│   │   ├── models/          # Data models
│   │   ├── services/        # Business logic
│   │   ├── config.py        # Configuration
│   │   ├── main.py          # FastAPI app
│   │   └── mcp_server.py    # MCP server
│   ├── env.example          # Environment template
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── lib/             # Utilities
│   │   ├── pages/           # Page components
│   │   └── store/           # Zustand stores
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## Safety Features

1. **Safety Guardian Agent**: Scans for self-harm references, medical advice
2. **Score Thresholds**: Safety ≥ 80, Empathy ≥ 70 required
3. **Max Iterations**: 5 revision loops before forced human review
4. **Human Gate**: Mandatory approval before finalization
5. **MCP Auto-approve**: Disabled by default

---

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs cerina-postgres

# Restart PostgreSQL
docker restart cerina-postgres
```

### Backend Won't Start

```bash
# Ensure conda env is activated
conda activate cbt

# Check if port 8000 is in use
lsof -i :8000

# Check environment variables
echo $OPENAI_API_KEY
```

### Frontend Build Issues

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## Development Commands

```bash
# Backend (from backend/ directory)
conda activate cbt
PYTHONPATH=. uvicorn app.main:app --reload --port 8000

# Frontend (from frontend/ directory)
npm run dev

# PostgreSQL
docker start cerina-postgres  # Start
docker stop cerina-postgres   # Stop
docker logs cerina-postgres   # View logs

# Docker Compose (all services)
docker-compose up -d          # Start all
docker-compose down           # Stop all
docker-compose logs -f        # View logs
```

---

## License

MIT
