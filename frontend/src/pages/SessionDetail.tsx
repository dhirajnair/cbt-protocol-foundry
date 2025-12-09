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
} from 'lucide-react'
import { toast } from '@/components/ui/toaster'

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [state, setState] = useState<StateResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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

      {/* Agent Notes */}
      {state?.scratchpad && state.scratchpad.length > 0 && (
        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Agent Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {state.scratchpad.map((note, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-white/60 border border-slate-200/50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs capitalize">
                        {note.agent.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(note.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{note.message}</p>
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

