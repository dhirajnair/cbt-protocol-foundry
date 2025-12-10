import { create } from 'zustand'

export type NodeStatus = 'idle' | 'active' | 'complete' | 'error'

export interface AgentNode {
  id: string
  label: string
  status: NodeStatus
}

export interface LogEntry {
  id: string
  timestamp: Date
  agent: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  input?: string | null
  output?: string | null
}

export interface SessionState {
  // Current session
  sessionId: string | null
  threadId: string | null
  intent: string
  status: string
  
  // Agent state
  currentDraft: string
  safetyScore: number
  empathyScore: number
  iterationCount: number
  
  // Visualization
  nodes: AgentNode[]
  activeNode: string | null
  logs: LogEntry[]
  
  // Connection
  isConnected: boolean
  isPaused: boolean
  
  // Actions
  setSession: (sessionId: string, threadId: string, intent: string) => void
  updateState: (data: Partial<SessionState>) => void
  setActiveNode: (nodeId: string | null) => void
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void
  addLog: (agent: string, message: string, type?: LogEntry['type'], input?: string | null, output?: string | null) => void
  clearLogs: () => void
  reset: () => void
}

const initialNodes: AgentNode[] = [
  { id: 'supervisor', label: 'Supervisor', status: 'idle' },
  { id: 'drafter', label: 'Drafter', status: 'idle' },
  { id: 'safety_guardian', label: 'Safety Guardian', status: 'idle' },
  { id: 'clinical_critic', label: 'Clinical Critic', status: 'idle' },
  { id: 'human_gate', label: 'Human Review', status: 'idle' },
  { id: 'finalize', label: 'Finalize', status: 'idle' },
]

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  threadId: null,
  intent: '',
  status: 'idle',
  currentDraft: '',
  safetyScore: 0,
  empathyScore: 0,
  iterationCount: 0,
  nodes: initialNodes,
  activeNode: null,
  logs: [],
  isConnected: false,
  isPaused: false,

  setSession: (sessionId, threadId, intent) =>
    set({
      sessionId,
      threadId,
      intent,
      status: 'running',
      nodes: initialNodes.map((n) => ({ ...n, status: 'idle' })),
      logs: [],
      currentDraft: '',
      safetyScore: 0,
      empathyScore: 0,
      iterationCount: 0,
    }),

  updateState: (data) => set((state) => ({ ...state, ...data })),

  setActiveNode: (nodeId) =>
    set((state) => ({
      activeNode: nodeId,
      nodes: state.nodes.map((n) => ({
        ...n,
        status: n.id === nodeId ? 'active' : n.status === 'active' ? 'complete' : n.status,
      })),
    })),

  updateNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, status } : n)),
    })),

  addLog: (agent, message, type = 'info', input = null, output = null) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
          agent,
          message,
          type,
          input,
          output,
        },
      ],
    })),

  clearLogs: () => set({ logs: [] }),

  reset: () =>
    set({
      sessionId: null,
      threadId: null,
      intent: '',
      status: 'idle',
      currentDraft: '',
      safetyScore: 0,
      empathyScore: 0,
      iterationCount: 0,
      nodes: initialNodes,
      activeNode: null,
      logs: [],
      isConnected: false,
      isPaused: false,
    }),
}))

