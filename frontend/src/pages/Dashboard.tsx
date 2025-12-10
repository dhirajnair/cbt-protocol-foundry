import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import AgentGraph from '@/components/AgentGraph'
import LiveStreamPanel from '@/components/LiveStreamPanel'
import IntentInput from '@/components/IntentInput'
import StateInspector from '@/components/StateInspector'
import ReviewModal from '@/components/ReviewModal'
import { useSessionStore } from '@/store/sessionStore'
import { api } from '@/lib/api'
import { Sparkles, Activity, History, ArrowRight, Play, Pause, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { useTheme } from '@/hooks/useTheme'

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showReviewModal, setShowReviewModal] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const { theme, toggleTheme } = useTheme()
  
  const {
    threadId,
    intent,
    status,
    currentDraft,
    safetyScore,
    empathyScore,
    sessionId,
    isConnected,
    updateState,
    setActiveNode,
    updateNodeStatus,
    addLog,
    reset,
    setSession,
  } = useSessionStore()

  // Check for existing session on mount and resume if stuck
  // Also check for resumeThreadId from navigation state (from History page)
  useEffect(() => {
    const checkAndResume = async () => {
      // Check if we have a resumeThreadId from navigation state (from History page)
      const resumeThreadId = (location.state as { resumeThreadId?: string })?.resumeThreadId
      
      if (resumeThreadId) {
        // Load session from thread_id
        try {
          const resumeInfo = await api.resumeSession(resumeThreadId)
          if (resumeInfo.session_id) {
            const session = await api.getSession(resumeInfo.session_id)
            setSession(session.id, session.thread_id, session.intent)
            if (resumeInfo.can_resume && !wsRef.current) {
              connectWebSocket(resumeThreadId)
              toast({
                title: 'Session Resumed',
                description: 'Resuming from last checkpoint',
                variant: 'success',
              })
            }
          }
        } catch (error) {
          console.error('Failed to resume session:', error)
          toast({
            title: 'Error',
            description: 'Failed to resume session',
            variant: 'destructive',
          })
        }
        return
      }
      
      // Otherwise check for existing session
      const currentThreadId = threadId
      const currentStatus = status
      if (currentThreadId && (currentStatus === 'running' || currentStatus === 'pending_review')) {
        try {
          const resumeInfo = await api.resumeSession(currentThreadId)
          if (resumeInfo.session_id && !sessionId) {
            updateState({ sessionId: resumeInfo.session_id })
          }
          if (resumeInfo.can_resume && !wsRef.current) {
            // Reconnect websocket to resume
            connectWebSocket(currentThreadId)
            toast({
              title: 'Session Resumed',
              description: 'Resuming from last checkpoint',
              variant: 'success',
            })
          }
        } catch (error) {
          console.error('Failed to resume session:', error)
        }
      }
    }
    checkAndResume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]) // Run when location state changes (e.g., resume from history)

  // Handle WebSocket connection
  const connectWebSocket = useCallback((tid: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    const ws = api.createWebSocket(tid)
    wsRef.current = ws

    ws.onopen = () => {
      updateState({ isConnected: true })
      addLog('system', 'Connected to agent stream', 'info')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // Debug inbound WS messages
        console.log('[UI WS] message received:', {
          type: data.type,
          status: data?.data?.status,
          next_agent: data?.data?.next_agent,
          iter: data?.data?.iteration_count,
          scratchpad_len: Array.isArray(data?.data?.scratchpad) ? data.data.scratchpad.length : 0,
          keys: data?.data ? Object.keys(data.data) : []
        })
        
        switch (data.type) {
          case 'initial_state':
            const initialStateStatus = data.data.status
            updateState({
              currentDraft: data.data.current_draft,
              safetyScore: data.data.safety_score,
              empathyScore: data.data.empathy_score,
              iterationCount: data.data.iteration_count,
              status: initialStateStatus,
              isPaused: data.data.is_paused,
            })
            // Set correct active node based on status
            if (initialStateStatus === 'pending_review') {
              setActiveNode('human_gate')
            } else if (initialStateStatus === 'drafting') {
              setActiveNode('drafter')
            } else if (data.data.next_agent) {
              setActiveNode(data.data.next_agent)
            }
            // Process scratchpad notes from initial state to show all agent activities
            // This ensures the full session history is loaded when resuming or viewing a session
            // IMPORTANT: Don't deduplicate here - these are historical notes that should all be shown
            if (data.data.scratchpad && Array.isArray(data.data.scratchpad)) {
              const agentMap: Record<string, string> = {
                'supervisor': 'supervisor',
                'drafter': 'drafter',
                'safety_guardian': 'safety_guardian',
                'clinical_critic': 'clinical_critic',
                'human_gate': 'human_gate',
                'human review': 'human_gate',  // Map both variations
                'finalize': 'finalize',
              }
              // Clear existing logs first when loading initial state (fresh start)
              // Then add all scratchpad notes to show full history
              const currentLogs = useSessionStore.getState().logs
              if (currentLogs.length === 0) {
                // Only add all notes if logs are empty (fresh session)
                data.data.scratchpad.forEach((note: { agent: string; message: string; input?: string | null; output?: string | null; timestamp?: string }) => {
                  if (note.agent && note.message) {
                    const normalizedAgent = agentMap[note.agent.toLowerCase()] || note.agent.toLowerCase()
                    addLog(normalizedAgent, note.message, 'info', note.input, note.output)
                  }
                })
              } else {
                // If logs exist, only add notes that don't exist (check by timestamp)
                data.data.scratchpad.forEach((note: { agent: string; message: string; input?: string | null; output?: string | null; timestamp?: string }) => {
                  if (note.agent && note.message) {
                    const normalizedAgent = agentMap[note.agent.toLowerCase()] || note.agent.toLowerCase()
                    // Check if this exact note (by timestamp) already exists
                    const exists = currentLogs.some(log => 
                      log.agent === normalizedAgent && 
                      note.timestamp && 
                      log.timestamp && 
                      Math.abs(new Date(note.timestamp).getTime() - log.timestamp.getTime()) < 1000
                    )
                    if (!exists) {
                      addLog(normalizedAgent, note.message, 'info', note.input, note.output)
                    }
                  }
                })
              }
            }
            if (data.data.is_paused) {
              setShowReviewModal(true)
            }
            break

          case 'state_update':
            const newStatus = data.data.status
            // Get current state FIRST before any operations
            const initialState = useSessionStore.getState()
            const storeState = initialState
            const currentIteration = storeState.iterationCount
            const newIterationCount = data.data.iteration_count ?? currentIteration
            const isNewIteration = data.data.iteration_count !== undefined && data.data.iteration_count > currentIteration
            
            // Get scratchpad early for logging
            const scratchpad = data.data.scratchpad || []
            
            // Update state with new values, preserving existing if not provided
            updateState({
              status: newStatus,
              safetyScore: data.data.safety_score ?? storeState.safetyScore,
              empathyScore: data.data.empathy_score ?? storeState.empathyScore,
              iterationCount: newIterationCount,
              currentDraft: data.data.current_draft ?? storeState.currentDraft,
            })
            
            // If starting a new iteration, reset node states (execution counts are preserved)
            // IMPORTANT: Do NOT clear logs - preserve all activity history across iterations
            if (isNewIteration && data.data.next_agent === 'drafter') {
              // LOG: New iteration detected
              const currentLogsCount = initialState.logs.length
              const currentScratchpadCount = scratchpad.length
              console.log('[UI LOG] 🔄 NEW ITERATION DETECTED:', {
                iteration: newIterationCount,
                previousIteration: currentIteration,
                logsBeforeReset: currentLogsCount,
                scratchpadCount: currentScratchpadCount,
                nextAgent: data.data.next_agent,
                timestamp: new Date().toISOString()
              })
              
              // Reset all nodes to idle when starting new iteration (keep execution counts)
              // Also reset previousNode to show fresh sequence
              updateState({ previousNode: null })
              updateNodeStatus('supervisor', 'idle')
              updateNodeStatus('drafter', 'idle')
              updateNodeStatus('safety_guardian', 'idle')
              updateNodeStatus('clinical_critic', 'idle')
              updateNodeStatus('human_gate', 'idle')
              updateNodeStatus('finalize', 'idle')
              // Add a separator log entry to mark new iteration (but preserve all previous logs)
              addLog('system', `Starting iteration ${newIterationCount}...`, 'info')
              
              // LOG: After iteration reset
              const stateAfterReset = useSessionStore.getState()
              console.log('[UI LOG] ✅ After iteration reset:', {
                logsAfterReset: stateAfterReset.logs.length,
                nodes: stateAfterReset.nodes.map(n => ({ id: n.id, count: n.executionCount, status: n.status })),
                timestamp: new Date().toISOString()
              })
            }
            
            // Process scratchpad notes first to determine agent state
            // Single source of truth: scratchpad notes indicate which agent just executed
            const latestNote = Array.isArray(scratchpad) && scratchpad.length > 0 
              ? scratchpad[scratchpad.length - 1] 
              : null
            
            // Get fresh state for logging (after potential iteration reset)
            const stateForLogging = useSessionStore.getState()
            const currentLogsBeforeUpdate = stateForLogging.logs.length
            const currentNodesBeforeUpdate = stateForLogging.nodes.map(n => ({ id: n.id, count: n.executionCount, status: n.status }))
            
            // LOG: State update received
            console.log('[UI LOG] 📥 STATE_UPDATE RECEIVED:', {
              scratchpadLength: scratchpad.length,
              scratchpadAgents: scratchpad.map((n: { agent?: string; timestamp?: string; message?: string }) => ({ 
                agent: n.agent, 
                timestamp: n.timestamp,
                message: n.message?.substring(0, 50) 
              })),
              latestNote: latestNote ? { agent: latestNote.agent, message: (latestNote.message || '').substring(0, 50) } : null,
              status: newStatus,
              next_agent: data.data.next_agent,
              iteration: newIterationCount,
              isNewIteration,
              currentLogsCount: currentLogsBeforeUpdate,
              currentNodes: currentNodesBeforeUpdate,
              timestamp: new Date().toISOString()
            })
            
            // Agent name mapping (normalize to node IDs)
            // Ensure human_gate is properly mapped (backend uses 'human_gate', frontend uses 'human_gate')
            const agentMap: Record<string, string> = {
              supervisor: 'supervisor',
              drafter: 'drafter',
              safety_guardian: 'safety_guardian',
              clinical_critic: 'clinical_critic',
              human_gate: 'human_gate',
              'human gate': 'human_gate',
              human_review: 'human_gate',
              'human review': 'human_gate',
              finalize: 'finalize',
            }
            
            // Determine active agent: latestNote shows who JUST finished, next_agent shows who's NEXT
            // Priority: status > next_agent (for next execution) > latestNote (for current state)
            // Use scratchpad notes to track ALL agent executions, including sequential agents
            let activeAgent: string | null = null
            let completedAgent: string | null = null
            
            // Get current state before processing (use fresh state after potential iteration reset)
            const currentState = useSessionStore.getState()
            
            // Step 1: Process ALL scratchpad notes to count executions for ALL agents
            // SCRATCHPAD IS THE SINGLE SOURCE OF TRUTH for execution counts
            // This ensures we track every agent execution accurately
            let updatedNodes = currentState.nodes
            if (Array.isArray(scratchpad) && scratchpad.length > 0) {
              const agentExecutionCounts: Record<string, number> = {}
              
              // Count ALL executions from scratchpad notes (each note = 1 execution)
              scratchpad.forEach((note: { agent: string }) => {
                if (note.agent) {
                  const mapped = agentMap[note.agent.toLowerCase()]
                  if (mapped) {
                    agentExecutionCounts[mapped] = (agentExecutionCounts[mapped] || 0) + 1
                  }
                }
              })
              
              // LOG: Execution counts calculated
              console.log('[UI LOG] 🔢 Step 1 - Execution counts from scratchpad:', agentExecutionCounts)
              
              // Update execution counts - SCRATCHPAD IS SOURCE OF TRUTH
              updatedNodes = currentState.nodes.map(n => {
                const countFromScratchpad = agentExecutionCounts[n.id] || 0
                // Always use scratchpad count as the definitive source
                // This ensures counts match what actually happened (from backend scratchpad)
                return { ...n, executionCount: countFromScratchpad }
              })
              
              // LOG: Nodes updated with counts
              const nodesDiff = updatedNodes.map(n => {
                const oldNode = currentState.nodes.find(on => on.id === n.id)
                const oldCount = oldNode?.executionCount || 0
                return {
                  id: n.id,
                  oldCount,
                  newCount: n.executionCount,
                  changed: oldCount !== n.executionCount
                }
              })
              console.log('[UI LOG] 📊 Step 1 - Nodes updated with counts:', nodesDiff)
              
              // Update state with new counts (this is the source of truth)
              updateState({ nodes: updatedNodes })
            
              // LOG: State updated
              const stateAfterCountUpdate = useSessionStore.getState()
              console.log('[UI LOG] ✅ Step 1 - State updated with counts:', {
                nodes: stateAfterCountUpdate.nodes.map(n => ({ id: n.id, count: n.executionCount, status: n.status })),
                timestamp: new Date().toISOString()
              })
            }
            
            // Step 1b: Identify which agent JUST finished (from latestNote)
            if (latestNote?.agent) {
              const latestAgentMapped = agentMap[latestNote.agent.toLowerCase()]
              if (latestAgentMapped) {
                completedAgent = latestAgentMapped
              }
            }
            
            // Step 2: Determine NEXT active agent (who should be executing now)
            // Check status-based routing first (for special states)
            if (newStatus === 'pending_review') {
              activeAgent = 'human_gate'
            } else if (newStatus === 'drafting') {
              activeAgent = 'drafter'
            } else if (data.data.next_agent === 'drafter' && (newStatus === 'running' || newStatus === 'needs_revision')) {
              // When routing to drafter for revision, drafter is active
              activeAgent = 'drafter'
            } else if (data.data.next_agent) {
              // Use next_agent to determine who should be active next
              const mapped = agentMap[data.data.next_agent.toLowerCase()]
              if (mapped) {
                activeAgent = mapped
              }
            } else if (latestNote?.agent && newStatus === 'running') {
              // Fallback: if we have a latest note and status is running, that agent might still be active
              const mapped = agentMap[latestNote.agent.toLowerCase()]
              if (mapped) {
                activeAgent = mapped
              }
            }
            
            // Ensure supervisor shows as active when it's processing (before routing)
            if (!activeAgent && newStatus === 'running') {
              // Check if supervisor note exists in scratchpad (not just latest)
              const hasSupervisorNote = Array.isArray(scratchpad) && scratchpad.length > 0 && scratchpad.some(
                (note: { agent: string }) => note.agent?.toLowerCase() === 'supervisor'
              )
              if (hasSupervisorNote) {
                activeAgent = 'supervisor'
              }
            }
            
            // Step 3: Mark completed agent as complete BEFORE setting next agent active
            if (completedAgent && completedAgent !== activeAgent) {
              // Agent finished, mark it complete
              updateNodeStatus(completedAgent, 'complete')
            }
            
            // Step 3b: Mark agents with executions as complete if they're not currently active
            // This ensures all agents that have executed show as green (complete)
            // Use updatedNodes from Step 1 (which has correct execution counts from scratchpad)
            // Get fresh state after count update to check current statuses
            const stateAfterCountUpdate = useSessionStore.getState()
            updatedNodes.forEach((node) => {
              // Get current status from store (might have been updated)
              const currentNode = stateAfterCountUpdate.nodes.find(n => n.id === node.id)
              const currentStatus = currentNode?.status || node.status
              
              // Mark agent as complete if:
              // 1. It has executed (executionCount > 0 from scratchpad)
              // 2. It's not the currently active agent
              // 3. It's not already marked as complete or active
              if (node.executionCount > 0 && 
                  node.id !== activeAgent && 
                  node.id !== stateAfterCountUpdate.activeNode && 
                  currentStatus !== 'complete' &&
                  currentStatus !== 'active') {
                // Agent has executed but isn't active, mark as complete (green)
                updateNodeStatus(node.id, 'complete')
              }
            })
            
            // Step 4: Handle active agent transition
            // IMPORTANT: Execution counts come from scratchpad (Step 1), not from setActiveNode
            if (activeAgent && activeAgent !== currentState.activeNode) {
              // Mark previous active node as complete (except human_gate which can be paused)
              if (currentState.activeNode && currentState.activeNode !== 'human_gate' && currentState.activeNode !== activeAgent) {
                updateNodeStatus(currentState.activeNode, 'complete')
            }
            
              // Set new active node - preserve execution count from scratchpad
              // Use updatedNodes (from Step 1) which has correct execution counts from scratchpad
              updateState({ 
                activeNode: activeAgent,
                previousNode: currentState.activeNode,
                nodes: updatedNodes.map(n => {
                  if (n.id === activeAgent) {
                    return { ...n, status: 'active' as const }
                  }
                  if (n.status === 'active' && n.id !== activeAgent) {
                    return { ...n, status: 'idle' as const }
                  }
                  return n
                })
              })
            } else if (completedAgent && !activeAgent) {
              // If we have a completed agent but no next agent, mark it complete
              if (completedAgent !== currentState.activeNode) {
                updateNodeStatus(completedAgent, 'complete')
              }
            }
            
            // Ensure drafter shows as active when status is drafting
            if (newStatus === 'drafting' && currentState.activeNode !== 'drafter') {
              if (currentState.activeNode && currentState.activeNode !== 'human_gate') {
                updateNodeStatus(currentState.activeNode, 'complete')
              }
              // Set drafter as active, preserving execution count from scratchpad
              updateState({
                activeNode: 'drafter',
                previousNode: currentState.activeNode,
                nodes: updatedNodes.map(n => {
                  if (n.id === 'drafter') {
                    return { ...n, status: 'active' as const }
                  }
                  if (n.status === 'active' && n.id !== 'drafter') {
                    return { ...n, status: 'idle' as const }
                  }
                  return n
                })
              })
            }
            
            // Handle terminal states
            if (newStatus === 'approved' || newStatus === 'failed' || newStatus === 'rejected' || newStatus === 'cancelled') {
              setActiveNode(null)
              updateState({ previousNode: null })
              if (newStatus === 'approved') {
                updateNodeStatus('finalize', 'complete')
              }
            }
            
            // Add scratchpad notes as logs (deduplicate by checking VERY recent logs only)
            // Process ALL scratchpad notes in order to maintain execution sequence
            // This ensures drafter, supervisor, safety_guardian, clinical_critic, finalize, human_gate all appear in Live Activity
            // CRITICAL: Only check last 20 logs for deduplication - this catches rapid duplicates but allows historical notes
            if (Array.isArray(scratchpad) && scratchpad.length > 0) {
              let addedCount = 0
              let skippedCount = 0
              
              scratchpad.forEach((note: { agent: string; message: string; input?: string | null; output?: string | null; timestamp?: string }) => {
                if (!note.agent || !note.message) return
                
                // Normalize agent name to match node IDs (ensure all agents are included)
                const normalizedAgent = agentMap[note.agent.toLowerCase()] || note.agent.toLowerCase()
                
                // Check if log already exists in VERY RECENT logs only (last 20) to catch rapid duplicates
                // This allows same agent to run multiple times and be logged each time
                const veryRecentLogs = currentState.logs.slice(-20) // Only check last 20 logs
                const logExists = veryRecentLogs.some(
                  log => {
                    const agentMatch = log.agent === normalizedAgent || 
                                      log.agent === note.agent ||
                                      log.agent.toLowerCase() === note.agent.toLowerCase()
                    
                    // Use timestamp for exact matching - only consider duplicate if timestamps match exactly
                    if (note.timestamp && log.timestamp) {
                      const noteTime = new Date(note.timestamp).getTime()
                      const logTime = log.timestamp.getTime()
                      const timeDiff = Math.abs(noteTime - logTime)
                      // Only consider it a duplicate if timestamps match exactly (within 100ms)
                      // This ensures each execution is logged, even if messages are similar
                      if (timeDiff < 100) {
                        // Timestamps match - check if message is also exactly the same
                        return agentMatch && log.message === note.message
                      }
                      return false // Different timestamps = different executions, always add
                    }
                    
                    // Fallback: if no timestamp, check if it's a VERY recent duplicate (within 500ms)
                    // This catches rapid duplicate messages but allows same agent to run multiple times
                    const timeDiff = Math.abs(Date.now() - log.timestamp.getTime())
                    if (timeDiff < 500) {
                      // Very recent - check if exact same message AND agent
                      return agentMatch && log.message === note.message
                    }
                    return false // Not recent enough to be a duplicate - always add
                  }
                )
                
                // Add log if it doesn't exist in very recent logs
                // This ensures all scratchpad notes are added, even if agent ran multiple times
                if (!logExists) {
                  addLog(normalizedAgent, note.message, 'info', note.input, note.output)
                  addedCount++
                } else {
                  skippedCount++
                }
              })
              
              // LOG: Scratchpad notes processing complete
              const stateAfterLogs = useSessionStore.getState()
              console.log('[UI LOG] 📝 Step 13 - Scratchpad notes processed:', {
                totalNotes: scratchpad.length,
                addedToLogs: addedCount,
                skippedAsDuplicates: skippedCount,
                logsBefore: currentLogsBeforeUpdate,
                logsAfter: stateAfterLogs.logs.length,
                logsAdded: stateAfterLogs.logs.length - currentLogsBeforeUpdate,
                latestLogs: stateAfterLogs.logs.slice(-5).map(l => ({ agent: l.agent, message: l.message?.substring(0, 50) })),
                timestamp: new Date().toISOString()
              })
            }
            break

          case 'interrupt':
            updateState({ 
              status: 'pending_review', 
              isPaused: true,
              currentDraft: data.data.current_draft || '',
              safetyScore: data.data.safety_score || 0,
              empathyScore: data.data.empathy_score || 0,
            })
            
            // Process scratchpad from interrupt (includes all notes up to the pause)
            const interruptScratchpad = data.data.scratchpad || []
            if (Array.isArray(interruptScratchpad) && interruptScratchpad.length > 0) {
              const agentMap: Record<string, string> = {
                supervisor: 'supervisor',
                drafter: 'drafter',
                safety_guardian: 'safety_guardian',
                clinical_critic: 'clinical_critic',
                human_gate: 'human_gate',
                'human gate': 'human_gate',
                human_review: 'human_gate',
                'human review': 'human_gate',
                finalize: 'finalize',
              }
              
              // Update execution counts so Human Review shows correctly
              const counts: Record<string, number> = {}
              interruptScratchpad.forEach((note: { agent: string }) => {
                if (note.agent) {
                  const mapped = agentMap[note.agent.toLowerCase()]
                  if (mapped) counts[mapped] = (counts[mapped] || 0) + 1
                }
              })
              const stateNow = useSessionStore.getState()
              const countedNodes = stateNow.nodes.map(n => ({
                ...n,
                executionCount: counts[n.id] || 0,
                status: n.id === 'human_gate'
                  ? 'active'
                  : (counts[n.id] || 0) > 0
                    ? (n.status === 'active' ? 'active' : 'complete')
                    : n.status
              }))
              updateState({ nodes: countedNodes, activeNode: 'human_gate', previousNode: stateNow.activeNode })
              
              // LOG: Interrupt received with scratchpad
              console.log('[UI LOG] 🛑 INTERRUPT RECEIVED:', {
                scratchpadLength: interruptScratchpad.length,
                scratchpadAgents: interruptScratchpad.map((n: { agent?: string }) => n.agent),
                iteration: data.data.iteration_count,
                timestamp: new Date().toISOString()
              })
              
              // Add all scratchpad notes that aren't already in logs
              interruptScratchpad.forEach((note: { agent: string; message: string; input?: string | null; output?: string | null; timestamp?: string }) => {
                if (note.agent && note.message) {
                  const normalizedAgent = agentMap[note.agent.toLowerCase()] || note.agent.toLowerCase()
                  const currentLogs = useSessionStore.getState().logs
                  const exists = currentLogs.some(log => 
                    log.agent === normalizedAgent && 
                    note.timestamp && 
                    log.timestamp && 
                    Math.abs(new Date(note.timestamp).getTime() - log.timestamp.getTime()) < 1000
                  )
                  if (!exists) {
                    addLog(normalizedAgent, note.message, 'info', note.input, note.output)
                  }
                }
              })
            } else {
              console.warn('[UI LOG] ⚠️ INTERRUPT received with EMPTY scratchpad!')
            }
            
            // When paused at human_gate, mark supervisor as complete and human_gate as active
            updateNodeStatus('supervisor', 'complete')
            setActiveNode('human_gate')
            addLog('system', 'Awaiting human review', 'warning')
            
            // If draft is in the interrupt message, show modal immediately
            // Otherwise fetch full state
            if (data.data.current_draft) {
              setShowReviewModal(true)
            } else {
              // Fallback: fetch full state if not in interrupt message
              api.getState(tid)
                .then((state) => {
                  updateState({
                    currentDraft: state.current_draft || '',
                    safetyScore: state.safety_score || 0,
                    empathyScore: state.empathy_score || 0,
                  })
                  setShowReviewModal(true)
                })
                .catch((error) => {
                  console.error('Failed to fetch state for review:', error)
                  addLog('system', 'Error loading draft for review', 'error')
                  // Still show modal so user can retry
                  setShowReviewModal(true)
                })
            }
            break

          case 'complete':
            updateState({ status: data.data.status, isPaused: false })
            addLog('system', `Generation completed: ${data.data.status}`, 'success')
            setActiveNode(null)
            // Close WebSocket and clear dashboard after a short delay
            if (wsRef.current) {
              wsRef.current.close()
              wsRef.current = null
            }
            // Do NOT auto-reset the dashboard; only reset when user starts a new protocol or refreshes
            break

          case 'error':
            updateState({ status: 'failed' })
            addLog('system', `Error: ${data.data.message}`, 'error')
            break

          case 'heartbeat':
            // Keep-alive, no action needed
            break
        }
      } catch (e) {
        console.error('WebSocket message error:', e)
      }
    }

    ws.onclose = () => {
      updateState({ isConnected: false })
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      addLog('system', 'Connection error', 'error')
    }
  }, [updateState, setActiveNode, updateNodeStatus, addLog])

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const handleSessionStart = (tid: string) => {
    connectWebSocket(tid)
  }

  const handleReviewComplete = async () => {
    // Reconnect to continue streaming if not approved
    if (threadId && status !== 'approved') {
      connectWebSocket(threadId)
    }
  }

  const handleNewSession = () => {
    reset()
    if (wsRef.current) {
      wsRef.current.close()
    }
  }

  const handlePauseSession = () => {
    // Close WebSocket to pause receiving updates
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    updateState({ isConnected: false })
    addLog('system', 'Session paused. Click Resume to continue.', 'warning')
    toast({
      title: 'Session Paused',
      description: 'Updates paused. Click Resume to continue.',
    })
  }


  const handleResumeSession = async () => {
    if (!threadId) return
    
    try {
      const resumeInfo = await api.resumeSession(threadId)
      if (resumeInfo.session_id && !sessionId) {
        updateState({ sessionId: resumeInfo.session_id })
      }
      if (resumeInfo.can_resume) {
        connectWebSocket(threadId)
        toast({
          title: 'Session Resumed',
          description: 'Resuming from last checkpoint',
          variant: 'success',
        })
      } else {
        toast({
          title: 'Cannot Resume',
          description: 'Session is not in a resumable state',
        })
      }
    } catch (error) {
      console.error('Failed to resume session:', error)
      toast({
        title: 'Error',
        description: 'Failed to resume session',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            CBT Protocol <span className="gradient-text">Generator</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Create safe, empathetic CBT protocols with AI assistance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            className="border-slate-200 dark:border-slate-700"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
          {status === 'approved' && (
            <Button variant="outline" onClick={handleNewSession}>
              <Sparkles className="w-4 h-4 mr-2" />
              New Protocol
            </Button>
          )}
          {threadId && status === 'running' && isConnected && (
            <Button 
              variant="outline" 
              onClick={handlePauseSession}
              title="Pause session updates"
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
          )}
          {threadId && (status === 'running' || status === 'pending_review') && !isConnected && (
            <Button 
              variant="outline" 
              onClick={handleResumeSession}
              title="Resume a paused session"
            >
              <Play className="w-4 h-4 mr-2" />
              Resume
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate('/history')}>
            <History className="w-4 h-4 mr-2" />
            View History
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {status && status !== 'idle' && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-white/60 border border-slate-200/50 dark:bg-slate-800/70 dark:border-slate-700">
          <Activity className={`w-5 h-5 ${status === 'running' ? 'text-primary animate-pulse' : 'text-secondary'}`} />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {intent.length > 80 ? intent.slice(0, 80) + '...' : intent}
            </p>
          </div>
          <Badge
            variant={
              status === 'running' ? 'info' :
              status === 'pending_review' ? 'warning' :
              status === 'approved' ? 'success' :
              'danger'
            }
          >
            {status.replace('_', ' ')}
          </Badge>
          {status === 'approved' && threadId && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/session/${threadId}`)}>
              View Details
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6">
        {/* Left column - Input and Graph */}
        <div className="space-y-6">
          {/* Intent Input Card */}
          <Card className="glass-panel">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Create Protocol
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IntentInput onSessionStart={handleSessionStart} />
            </CardContent>
          </Card>

          {/* Agent Graph */}
          <Card className="glass-panel">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
              <CardTitle className="text-lg">Agent Workflow</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Visual progress tracker showing which AI agents are currently processing your protocol
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <AgentGraph />
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded border-2 border-primary-400 bg-primary-50" />
                    <span>Active (Processing)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded border-2 border-green-400 bg-green-50" />
                    <span>Complete</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded border-2 border-slate-200 bg-slate-100" />
                    <span>Idle (Waiting)</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-2 border-t border-slate-200/50">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-green-500" />
                    <span>Current Flow</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-indigo-500" />
                    <span>Completed Path</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-slate-400 opacity-50" />
                    <span>Potential Path</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - State on top, Live Activity sized to graph */}
        <div className="space-y-4 flex flex-col h-full">
          <StateInspector />
          <div className="flex-1 min-h-[560px] lg:min-h-[640px] max-h-[75vh]">
            <LiveStreamPanel />
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {threadId && (
        <ReviewModal
          open={showReviewModal}
          onOpenChange={setShowReviewModal}
          threadId={threadId}
          draft={currentDraft}
          safetyScore={safetyScore}
          empathyScore={empathyScore}
          onReviewComplete={handleReviewComplete}
        />
      )}
    </div>
  )
}

