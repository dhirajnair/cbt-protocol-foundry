import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSessionStore } from '@/store/sessionStore'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/toaster'
import { Sparkles, Loader2 } from 'lucide-react'

const exampleIntents = [
  'Create an exposure hierarchy for social anxiety',
  'Design a thought record for challenging negative thoughts',
  'Build a sleep hygiene protocol for insomnia',
  'Create a behavioral activation plan for depression',
  'Design a worry time exercise for generalized anxiety',
]

interface IntentInputProps {
  onSessionStart: (threadId: string) => void
}

export default function IntentInput({ onSessionStart }: IntentInputProps) {
  const [intent, setIntent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { setSession, status } = useSessionStore()

  const handleSubmit = async () => {
    if (!intent.trim() || isLoading || status === 'running') return

    setIsLoading(true)
    try {
      const response = await api.generate(intent.trim())
      setSession(response.session_id, response.thread_id, intent.trim())
      onSessionStart(response.thread_id)
      toast({
        title: 'Generation started',
        description: 'Agents are working on your protocol...',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start generation. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setIntent(example)
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Describe the CBT protocol you want to create..."
          className="min-h-[120px] pr-4 resize-none bg-white/80 border-slate-200"
          disabled={isLoading || status === 'running'}
        />
        <div className="absolute bottom-3 right-3">
          <Button
            onClick={handleSubmit}
            disabled={!intent.trim() || isLoading || status === 'running'}
            className="shadow-lg"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
      </div>

      {/* Example prompts */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Try an example:</p>
        <div className="flex flex-wrap gap-2">
          {exampleIntents.map((example, i) => (
            <button
              key={i}
              onClick={() => handleExampleClick(example)}
              disabled={isLoading || status === 'running'}
              className="text-xs px-3 py-1.5 rounded-full bg-white/60 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/50 transition-colors disabled:opacity-50"
            >
              {example.length > 40 ? example.slice(0, 40) + '...' : example}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

