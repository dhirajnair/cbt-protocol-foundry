import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import AgentGraph from '@/components/AgentGraph'
import LiveStreamPanel from '@/components/LiveStreamPanel'
import IntentInput from '@/components/IntentInput'
import StateInspector from '@/components/StateInspector'
import ReviewModal from '@/components/ReviewModal'
import { useSessionStore } from '@/store/sessionStore'
import { api } from '@/lib/api'
import { Sparkles, Activity, History, ArrowRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'

export default function Dashboard() {
  const navigate = useNavigate()
  const [showReviewModal, setShowReviewModal] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  
  const {
    threadId,
    intent,
    status,
    currentDraft,
    safetyScore,
    empathyScore,
    sessionId,
    updateState,
    setActiveNode,
    addLog,
    reset,
    setSession,
  } = useSessionStore()

  // Check for existing session on mount and resume if stuck
  useEffect(() => {
    const checkAndResume = async () => {
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
  }, []) // Only run on mount

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
            } else if (data.data.next_agent) {
              setActiveNode(data.data.next_agent)
            }
            if (data.data.is_paused) {
              setShowReviewModal(true)
            }
            break

          case 'state_update':
            const newStatus = data.data.status
            updateState({
              status: newStatus,
              safetyScore: data.data.safety_score || 0,
              empathyScore: data.data.empathy_score || 0,
              iterationCount: data.data.iteration_count || 0,
              currentDraft: data.data.current_draft || '',
            })
            
            // Update active node - clear if pending_review, otherwise set next_agent
            if (newStatus === 'pending_review') {
              setActiveNode('human_gate')
            } else if (data.data.next_agent && newStatus !== 'pending_review') {
              setActiveNode(data.data.next_agent)
              addLog(data.data.next_agent || 'system', `Processing...`, 'info')
            } else if (newStatus === 'approved' || newStatus === 'failed' || newStatus === 'rejected') {
              setActiveNode(null)
            }
            
            // Add scratchpad notes as logs
            if (data.data.scratchpad) {
              data.data.scratchpad.forEach((note: { agent: string; message: string; input?: string | null; output?: string | null }) => {
                addLog(note.agent, note.message, 'info', note.input, note.output)
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
  }, [updateState, setActiveNode, addLog])

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
          variant: 'warning',
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
          <h1 className="text-3xl font-display font-bold text-slate-800">
            Protocol <span className="gradient-text">Generator</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Create safe, empathetic CBT protocols with AI assistance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'approved' && (
            <Button variant="outline" onClick={handleNewSession}>
              <Sparkles className="w-4 h-4 mr-2" />
              New Protocol
            </Button>
          )}
          {threadId && status !== 'idle' && status !== 'approved' && (
            <Button variant="outline" onClick={handleResumeSession}>
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
        <div className="flex items-center gap-3 p-4 rounded-xl bg-white/60 border border-slate-200/50">
          <Activity className={`w-5 h-5 ${status === 'running' ? 'text-primary animate-pulse' : 'text-secondary'}`} />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Input and Graph */}
        <div className="lg:col-span-2 space-y-6">
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
              <CardTitle className="text-lg">Agent Workflow</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <AgentGraph />
            </CardContent>
          </Card>
        </div>

        {/* Right column - Stream and State */}
        <div className="space-y-6">
          {/* Live Stream */}
          <div className="h-[400px]">
            <LiveStreamPanel />
          </div>

          {/* State Inspector */}
          <StateInspector />
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

