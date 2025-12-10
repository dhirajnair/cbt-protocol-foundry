const API_BASE = import.meta.env.VITE_API_URL || ''
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export interface Session {
  id: string
  thread_id: string
  intent: string
  status: string
  created_at: string
  updated_at: string
  final_artifact: string | null
  safety_score: number | null
  empathy_score: number | null
  iteration_count: number
}

export interface GenerateResponse {
  session_id: string
  thread_id: string
  status: string
}

export interface StateResponse {
  thread_id: string
  intent: string
  current_draft: string
  safety_score: number
  empathy_score: number
  iteration_count: number
  status: string
  scratchpad: Array<{
    agent: string
    message: string
    timestamp: string
    input?: string | null
    output?: string | null
  }>
}

export interface SessionListResponse {
  items: Session[]
  total: number
  page: number
  per_page: number
}

export const api = {
  async generate(intent: string): Promise<GenerateResponse> {
    const res = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    })
    if (!res.ok) throw new Error('Failed to start generation')
    return res.json()
  },

  async getSession(sessionId: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}`)
    if (!res.ok) throw new Error('Session not found')
    return res.json()
  },

  async getSessions(page = 1, perPage = 20, status?: string): Promise<SessionListResponse> {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (status) params.append('status', status)
    const res = await fetch(`${API_BASE}/api/sessions?${params}`)
    if (!res.ok) throw new Error('Failed to fetch sessions')
    return res.json()
  },

  async getState(threadId: string): Promise<StateResponse> {
    const res = await fetch(`${API_BASE}/api/state/${threadId}`)
    if (!res.ok) throw new Error('State not found')
    return res.json()
  },

  async submitReview(
    threadId: string,
    action: 'approve' | 'reject' | 'cancel',
    edits?: string,
    feedback?: string
  ): Promise<{ status: string; thread_id: string }> {
    const res = await fetch(`${API_BASE}/api/review/${threadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, edits, feedback }),
    })
    if (!res.ok) throw new Error('Failed to submit review')
    return res.json()
  },

  async resumeSession(threadId: string): Promise<{
    status: string
    thread_id: string
    session_id: string
    current_status: string
    can_resume: boolean
    next_node: string | null
  }> {
    const res = await fetch(`${API_BASE}/api/resume/${threadId}`)
    if (!res.ok) throw new Error('Failed to resume session')
    return res.json()
  },

  async deleteSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete session')
    return res.json()
  },

  async deleteSessionByThread(threadId: string): Promise<{ status: string; thread_id: string }> {
    const res = await fetch(`${API_BASE}/api/session/thread/${threadId}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete session')
    return res.json()
  },

  createWebSocket(threadId: string): WebSocket {
    return new WebSocket(`${WS_BASE}/ws/stream/${threadId}`)
  },
}

