import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, type Session, type StateResponse } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  ChevronLeft,
  Copy,
  Check,
  RefreshCw,
  Shield,
  Heart,
  Clock,
  FileText,
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Brain,
  PenTool,
  User,
  CheckCircle,
} from 'lucide-react'
import { toast } from '@/components/ui/toaster'

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [state, setState] = useState<StateResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [expandedInputs, setExpandedInputs] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (id) {
      loadSession()
    }
  }, [id])

  const loadSession = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const sessionData = await api.getSession(id)
      setSession(sessionData)
      
      // Load state from checkpoint
      try {
        const stateData = await api.getState(sessionData.thread_id)
        setState(stateData)
      } catch {
        // State might not be available
      }
    } catch (error) {
      console.error('Failed to load session:', error)
      toast({
        title: 'Error',
        description: 'Failed to load session details',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    if (session?.final_artifact) {
      await navigator.clipboard.writeText(session.final_artifact)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast({
        title: 'Copied!',
        description: 'Protocol copied to clipboard',
        variant: 'success',
      })
    }
  }

  const handleRerun = () => {
    if (session) {
      navigate('/', { state: { intent: session.intent } })
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success'
      case 'pending_review':
        return 'warning'
      case 'running':
        return 'info'
      case 'failed':
      case 'rejected':
        return 'danger'
      default:
        return 'outline'
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
        <p className="text-muted-foreground">Session not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/history')}>
          Back to History
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/history')} className="mb-2">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to History
          </Button>
          <h1 className="text-2xl font-display font-bold text-slate-800">Session Details</h1>
          <p className="text-muted-foreground mt-1">{formatDate(session.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRerun}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-run
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={getStatusVariant(session.status)} className="mt-1">
                  {session.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Safety Score</p>
                <p className="text-xl font-bold text-secondary">
                  {session.safety_score ?? '-'}<span className="text-sm text-muted-foreground">/100</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pink-100 flex items-center justify-center">
                <Heart className="w-5 h-5 text-pink-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Empathy Score</p>
                <p className="text-xl font-bold text-pink-500">
                  {session.empathy_score ?? '-'}<span className="text-sm text-muted-foreground">/100</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Iterations</p>
                <p className="text-xl font-bold text-amber-600">
                  {session.iteration_count}<span className="text-sm text-muted-foreground">/5</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Intent */}
      <Card className="glass-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Original Request</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-700">{session.intent}</p>
        </CardContent>
      </Card>

      {/* Final Artifact */}
      {session.final_artifact && (
        <Card className="glass-panel">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Generated Protocol
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="w-4 h-4 mr-1 text-secondary" />
              ) : (
                <Copy className="w-4 h-4 mr-1" />
              )}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="prose prose-sm max-w-none p-4 bg-slate-50 rounded-lg">
                <pre className="whitespace-pre-wrap font-sans text-slate-700">
                  {session.final_artifact}
                </pre>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Agent Workflow Sequence */}
      {state?.scratchpad && state.scratchpad.length > 0 && (
        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Agent Workflow Sequence
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Sequence of agent calls with execution counts
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Count agent executions */}
              {(() => {
                const agentCounts: Record<string, number> = {}
                const agentSequence: Array<{ agent: string; timestamp: string }> = []
                
                state.scratchpad.forEach((note) => {
                  // Normalize agent name - ensure human_gate/human_review variations map to Human Review
                  let agentName = note.agent.replace('_', ' ')
                  const lower = agentName.toLowerCase()
                  if (['human gate', 'human_review', 'human review'].includes(lower)) {
                    agentName = 'Human Review'
                  }
                  agentCounts[agentName] = (agentCounts[agentName] || 0) + 1
                  agentSequence.push({ agent: agentName, timestamp: note.timestamp })
                })
                
                const agentIcons: Record<string, typeof Brain> = {
                  'supervisor': Brain,
                  'drafter': PenTool,
                  'safety guardian': Shield,
                  'clinical critic': Heart,
                  'human gate': User,
                  'human review': User,  // Maps both 'human gate' and 'human review' variations
                  'finalize': CheckCircle,
                }
                
                return (
                  <>
                    {/* Execution counts */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                      {Object.entries(agentCounts).map(([agent, count]) => {
                        const Icon = agentIcons[agent.toLowerCase()] || Activity
                        return (
                          <div
                            key={agent}
                            className="flex items-center gap-2 p-2 rounded-lg bg-white/60 border border-slate-200/50"
                          >
                            <Icon className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium capitalize">{agent}</span>
                            <Badge variant="outline" className="ml-auto">
                              {count} {count === 1 ? 'call' : 'calls'}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                    
                    {/* Sequence visualization */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">Call Sequence:</h4>
                      <div className="flex flex-wrap items-center gap-2">
                        {agentSequence.map((item, idx) => {
                          const Icon = agentIcons[item.agent.toLowerCase()] || Activity
                          return (
                            <div key={idx} className="flex items-center gap-1">
                              <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/60 border border-slate-200/50">
                                <Icon className="w-3 h-3 text-primary" />
                                <span className="text-xs font-medium capitalize">{item.agent}</span>
                              </div>
                              {idx < agentSequence.length - 1 && (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Notes */}
      {state?.scratchpad && state.scratchpad.length > 0 && (
        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Agent Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {state.scratchpad.map((note, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg bg-white/60 border border-slate-200/50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {note.agent.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(note.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mb-3 font-medium">{note.message}</p>
                    
                    {(note.input || note.output) && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-slate-200/50">
                        {note.input && (
                          <div>
                            <button
                              onClick={() => {
                                const newExpanded = new Set(expandedInputs)
                                if (newExpanded.has(i)) {
                                  newExpanded.delete(i)
                                } else {
                                  newExpanded.add(i)
                                }
                                setExpandedInputs(newExpanded)
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide hover:text-slate-700 transition-colors"
                            >
                              {expandedInputs.has(i) ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                              Input
                            </button>
                            {expandedInputs.has(i) && (
                              <div className="text-xs text-slate-600 bg-slate-50/80 p-2 rounded border border-slate-200/50 font-mono whitespace-pre-wrap break-words">
                                {note.input}
                              </div>
                            )}
                          </div>
                        )}
                        {note.output && (
                          <div>
                            <button
                              onClick={() => {
                                const newExpanded = new Set(expandedInputs)
                                const outputKey = i + 10000 // Separate key for output
                                if (newExpanded.has(outputKey)) {
                                  newExpanded.delete(outputKey)
                                } else {
                                  newExpanded.add(outputKey)
                                }
                                setExpandedInputs(newExpanded)
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide hover:text-slate-700 transition-colors"
                            >
                              {expandedInputs.has(i + 10000) ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                              Output
                            </button>
                            {expandedInputs.has(i + 10000) && (
                              <div className="text-xs text-slate-600 bg-blue-50/80 p-2 rounded border border-blue-200/50 font-mono whitespace-pre-wrap break-words">
                                {note.output}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Pending Review Button */}
      {session.status === 'pending_review' && (
        <Card className="glass-panel bg-accent/5 border-accent/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-amber-700">Review Required</p>
                <p className="text-sm text-muted-foreground">
                  This protocol is awaiting human approval
                </p>
              </div>
              <Button onClick={() => navigate(`/review/${session.thread_id}`)}>
                Review Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

