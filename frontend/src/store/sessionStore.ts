import { create } from 'zustand'

export type NodeStatus = 'idle' | 'active' | 'complete' | 'error'

export interface AgentNode {
  id: string
  label: string
  status: NodeStatus
  executionCount: number
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
  previousNode: string | null  // Track previous agent for edge animation
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
  { id: 'supervisor', label: 'Supervisor', status: 'idle', executionCount: 0 },
  { id: 'drafter', label: 'Drafter', status: 'idle', executionCount: 0 },
  { id: 'safety_guardian', label: 'Safety Guardian', status: 'idle', executionCount: 0 },
  { id: 'clinical_critic', label: 'Clinical Critic', status: 'idle', executionCount: 0 },
  { id: 'human_gate', label: 'Human Review', status: 'idle', executionCount: 0 },
  { id: 'finalize', label: 'Finalize', status: 'idle', executionCount: 0 },
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
    set((state) => {
      // When setting a new session, only clear logs if it's a completely new session
      // If resuming an existing session (same threadId), preserve logs
      const isNewSession = state.threadId !== threadId
      return {
      sessionId,
      threadId,
      intent,
      status: 'running',
        nodes: initialNodes.map((n) => ({ ...n, status: 'idle', executionCount: 0 })),
        activeNode: null,
        previousNode: null,
        logs: isNewSession ? [] : state.logs, // Preserve logs when resuming same session
      currentDraft: '',
      safetyScore: 0,
      empathyScore: 0,
      iterationCount: 0,
      }
    }),

  updateState: (data) => set((state) => ({ ...state, ...data })),

  setActiveNode: (nodeId) =>
    set((state) => {
      // Only update if nodeId changed to avoid unnecessary re-renders
      if (state.activeNode === nodeId) return state
      
      return {
        previousNode: state.activeNode,  // Track previous node for edge animation
      activeNode: nodeId,
        nodes: state.nodes.map((n) => {
          if (n.id === nodeId) {
            // Increment execution count when agent becomes active
            return { ...n, status: 'active' as NodeStatus, executionCount: n.executionCount + 1 }
          }
          // Keep completed nodes as complete, don't revert them
          if (n.status === 'complete') {
            return n
          }
          // Reset active nodes that are no longer active (unless they're complete)
          return { ...n, status: n.status === 'active' ? 'idle' as NodeStatus : n.status }
        }),
      }
    }),

  updateNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, status } : n)),
    })),

  incrementAgentExecution: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.map((n) => 
        n.id === nodeId ? { ...n, executionCount: n.executionCount + 1 } : n
      ),
    })),

  addLog: (agent, message, type = 'info', input = null, output = null) =>
    set((state) => {
      const newLog = {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
          agent,
          message,
          type,
        input,
        output,
      }
      const newLogs = [...state.logs, newLog]
      // LOG: Log added to Live Activity
      console.log('[UI LOG] ➕ LOG ADDED:', {
        agent,
        message: message.substring(0, 100),
        type,
        totalLogs: newLogs.length,
        timestamp: newLog.timestamp.toISOString()
      })
      return { logs: newLogs }
    }),

  clearLogs: () => {
    console.warn('[UI LOG] ⚠️ LOGS CLEARED - This should not happen during normal operation!', {
      timestamp: new Date().toISOString(),
      stackTrace: new Error().stack
    })
    set({ logs: [] })
  },

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
      previousNode: null,
      logs: [],
      isConnected: false,
      isPaused: false,
    }),
}))

