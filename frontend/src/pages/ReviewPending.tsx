import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, type StateResponse } from '@/lib/api'
import { toast } from '@/components/ui/toaster'
import {
  ChevronLeft,
  Check,
  X,
  Edit3,
  Shield,
  Heart,
  Clock,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react'

export default function ReviewPending() {
  const { threadId } = useParams<{ threadId: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<StateResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editedDraft, setEditedDraft] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (threadId) {
      loadState()
    }
  }, [threadId])

  const loadState = async () => {
    if (!threadId) return
    setIsLoading(true)
    try {
      const stateData = await api.getState(threadId)
      setState(stateData)
      setEditedDraft(stateData.current_draft)
    } catch (error) {
      console.error('Failed to load state:', error)
      toast({
        title: 'Error',
        description: 'Failed to load session for review',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!threadId) return
    setIsSubmitting(true)
    try {
      const edits = editedDraft !== state?.current_draft ? editedDraft : undefined
      await api.submitReview(threadId, 'approve', edits)
      toast({
        title: 'Protocol Approved',
        description: 'The CBT protocol has been finalized.',
        variant: 'success',
      })
      navigate('/history')
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit approval.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!threadId) return
    setIsSubmitting(true)
    try {
      await api.submitReview(threadId, 'reject', editedDraft, feedback)
      toast({
        title: 'Revision Requested',
        description: 'The protocol is being revised.',
      })
      navigate('/')
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit revision request.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!threadId) return
    setIsSubmitting(true)
    try {
      await api.submitReview(threadId, 'cancel')
      toast({
        title: 'Session Cancelled',
        description: 'The protocol generation has been cancelled.',
      })
      navigate('/history')
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel session.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!state) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
        <p className="text-muted-foreground">Session not found or no longer pending review</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/history')}>
          Back to History
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-secondary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            Human Review Required
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and approve the generated CBT protocol
          </p>
        </div>
      </div>

      {/* Context */}
      <Card className="glass-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Request Context</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-700 mb-4">{state.intent}</p>
          
          {/* Metrics */}
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-secondary" />
              <span className="text-sm text-muted-foreground">Safety:</span>
              <Badge variant={state.safety_score >= 80 ? 'success' : 'warning'}>
                {state.safety_score}/100
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-500" />
              <span className="text-sm text-muted-foreground">Empathy:</span>
              <Badge variant={state.empathy_score >= 70 ? 'success' : 'warning'}>
                {state.empathy_score}/100
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-muted-foreground">Iterations:</span>
              <Badge variant="outline">{state.iteration_count}/5</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Draft Editor */}
      <Card className="glass-panel">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Generated Protocol</CardTitle>
          <div className="flex items-center gap-2">
            {editedDraft !== state.current_draft && (
              <Badge variant="info">Modified</Badge>
            )}
            <Button
              variant={isEditing ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Edit3 className="w-4 h-4 mr-1" />
              {isEditing ? 'Done Editing' : 'Edit Draft'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={editedDraft}
              onChange={(e) => setEditedDraft(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="prose prose-sm max-w-none p-4 bg-slate-50 rounded-lg">
                <pre className="whitespace-pre-wrap font-sans text-slate-700">
                  {editedDraft}
                </pre>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Feedback */}
      <Card className="glass-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Feedback (Optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Provide feedback for the agents if requesting revisions..."
            className="min-h-[100px]"
          />
        </CardContent>
      </Card>

      {/* Agent Notes */}
      {state.scratchpad && state.scratchpad.length > 0 && (
        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Agent Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {state.scratchpad.slice(-5).map((note, i) => (
                  <div key={i} className="p-2 rounded bg-slate-50 text-sm">
                    <span className="font-medium capitalize text-slate-700">
                      {note.agent.replace('_', ' ')}:
                    </span>{' '}
                    <span className="text-slate-600">{note.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/50">
        <Button variant="destructive" onClick={handleCancel} disabled={isSubmitting}>
          <X className="w-4 h-4 mr-1" />
          Cancel Session
        </Button>
        <Button variant="accent" onClick={handleReject} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Edit3 className="w-4 h-4 mr-1" />
          )}
          Request Revision
        </Button>
        <Button variant="secondary" onClick={handleApprove} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-1" />
          )}
          Approve Protocol
        </Button>
      </div>
    </div>
  )
}

