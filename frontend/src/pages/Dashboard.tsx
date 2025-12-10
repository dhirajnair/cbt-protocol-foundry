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
import { Sparkles, Activity, History, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
    updateState,
    setActiveNode,
    addLog,
    reset,
  } = useSessionStore()

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
            updateState({
              currentDraft: data.data.current_draft,
              safetyScore: data.data.safety_score,
              empathyScore: data.data.empathy_score,
              iterationCount: data.data.iteration_count,
              status: data.data.status,
              isPaused: data.data.is_paused,
            })
            if (data.data.is_paused) {
              setShowReviewModal(true)
            }
            break

          case 'state_update':
            updateState({
              status: data.data.status,
              safetyScore: data.data.safety_score || 0,
              empathyScore: data.data.empathy_score || 0,
              iterationCount: data.data.iteration_count || 0,
              currentDraft: data.data.current_draft || '',
            })
            
            // Update active node
            if (data.data.next_agent) {
              setActiveNode(data.data.next_agent)
              addLog(data.data.next_agent || 'system', `Processing...`, 'info')
            }
            
            // Add scratchpad notes as logs
            if (data.data.scratchpad) {
              data.data.scratchpad.forEach((note: { agent: string; message: string }) => {
                addLog(note.agent, note.message, 'info')
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

