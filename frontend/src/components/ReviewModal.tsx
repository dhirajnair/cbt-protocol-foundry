import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toaster'
import { useSessionStore } from '@/store/sessionStore'
import { Check, X, Edit3, Shield, Heart, Loader2 } from 'lucide-react'

interface ReviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  threadId: string
  draft: string
  safetyScore: number
  empathyScore: number
  onReviewComplete: () => void
}

export default function ReviewModal({
  open,
  onOpenChange,
  threadId,
  draft,
  safetyScore,
  empathyScore,
  onReviewComplete,
}: ReviewModalProps) {
  const [editedDraft, setEditedDraft] = useState(draft)
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { updateState, addLog } = useSessionStore()
  
  // Store original draft for comparison
  const originalDraftRef = useRef(draft || '')

  // Update editedDraft when draft prop changes (e.g., after API fetch)
  useEffect(() => {
    if (draft) {
      setEditedDraft(draft)
      originalDraftRef.current = draft
      setIsLoading(false)
    }
  }, [draft])

  // Fetch full state when modal opens if draft is empty
  useEffect(() => {
    if (open && threadId) {
      if (!draft || draft.trim() === '') {
        setIsLoading(true)
        api.getState(threadId)
          .then((state) => {
            setEditedDraft(state.current_draft || '')
            setIsLoading(false)
          })
          .catch((error) => {
            console.error('Failed to fetch state:', error)
            setIsLoading(false)
            toast({
              title: 'Error',
              description: 'Failed to load draft content. Please try again.',
              variant: 'destructive',
            })
          })
      } else {
        setEditedDraft(draft)
      }
    }
  }, [open, threadId])

  const handleApprove = async () => {
    setIsSubmitting(true)
    try {
      const edits = editedDraft !== draft ? editedDraft : undefined
      await api.submitReview(threadId, 'approve', edits)
      updateState({ status: 'approved' })
      toast({
        title: 'Protocol Approved',
        description: 'The CBT protocol has been finalized.',
        variant: 'success',
      })
      onReviewComplete()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit approval. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    setIsSubmitting(true)
    try {
      // Add log entry for revision request before submitting
      const hasEdits = editedDraft.trim() !== originalDraftRef.current.trim()
      const feedbackText = feedback.trim() || (hasEdits ? 'Draft edited' : 'No feedback provided')
      addLog('human_gate', `Revision requested. Feedback: ${feedbackText}`, 'warning')
      
      await api.submitReview(threadId, 'reject', editedDraft, feedback)
      updateState({ status: 'running', isPaused: false })
      toast({
        title: 'Revision Requested',
        description: 'The protocol is being revised based on your feedback.',
      })
      onOpenChange(false)
      // Reconnect websocket to continue receiving updates
      onReviewComplete()
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
    setIsSubmitting(true)
    try {
      await api.submitReview(threadId, 'cancel')
      updateState({ status: 'cancelled' })
      toast({
        title: 'Session Cancelled',
        description: 'The protocol generation has been cancelled.',
      })
      onOpenChange(false)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-secondary flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            Human Review Required
          </DialogTitle>
          <DialogDescription>
            Review the generated CBT protocol before finalizing. You can edit the content or request revisions.
          </DialogDescription>
        </DialogHeader>

        {/* Scores */}
        <div className="flex gap-4 py-3 border-y border-slate-200/50">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-secondary" />
            <span className="text-sm text-muted-foreground">Safety:</span>
            <Badge variant={safetyScore >= 80 ? 'success' : 'warning'}>{safetyScore}/100</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-500" />
            <span className="text-sm text-muted-foreground">Empathy:</span>
            <Badge variant={empathyScore >= 70 ? 'success' : 'warning'}>{empathyScore}/100</Badge>
          </div>
        </div>

        {/* Draft content */}
        <ScrollArea className="flex-1 min-h-[300px] max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading draft content...</p>
              </div>
            </div>
          ) : isEditing ? (
            <Textarea
              value={editedDraft}
              onChange={(e) => setEditedDraft(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
          ) : editedDraft ? (
            <div className="prose prose-sm max-w-none p-4 bg-slate-50 rounded-lg">
              <pre className="whitespace-pre-wrap font-sans text-slate-700">{editedDraft}</pre>
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[300px]">
              <p className="text-sm text-muted-foreground">No draft content available</p>
            </div>
          )}
        </ScrollArea>

        {/* Edit toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={isEditing ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Edit3 className="w-4 h-4 mr-1" />
            {isEditing ? 'Done Editing' : 'Edit Draft'}
          </Button>
          {editedDraft !== draft && (
            <Badge variant="info">Modified</Badge>
          )}
        </div>

        {/* Feedback for rejection */}
        <div>
          <label className="text-sm font-medium text-slate-700">
            Feedback (optional, for revisions)
          </label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Provide feedback for the agents if requesting revisions..."
            className="mt-1 min-h-[80px]"
          />
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="destructive" onClick={handleCancel} disabled={isSubmitting}>
            <X className="w-4 h-4 mr-1" />
            Cancel
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
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

