import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSessionStore, type LogEntry } from '@/store/sessionStore'
import { cn } from '@/lib/utils'
import {
  Brain,
  PenTool,
  Shield,
  Heart,
  User,
  CheckCircle,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react'

const agentIcons: Record<string, LucideIcon> = {
  supervisor: Brain,
  drafter: PenTool,
  safety_guardian: Shield,
  clinical_critic: Heart,
  human_gate: User,
  finalize: CheckCircle,
  system: AlertCircle,
}

const agentColors: Record<string, string> = {
  supervisor: 'text-purple-600 bg-purple-50',
  drafter: 'text-blue-600 bg-blue-50',
  safety_guardian: 'text-amber-600 bg-amber-50',
  clinical_critic: 'text-pink-600 bg-pink-50',
  human_gate: 'text-cyan-600 bg-cyan-50',
  finalize: 'text-green-600 bg-green-50',
  system: 'text-slate-600 bg-slate-50',
}

function LogEntryItem({ entry }: { entry: LogEntry }) {
  const Icon = agentIcons[entry.agent] || AlertCircle
  const colorClass = agentColors[entry.agent] || agentColors.system
  
  const typeClasses = {
    info: 'border-l-slate-300',
    success: 'border-l-secondary',
    warning: 'border-l-accent',
    error: 'border-l-destructive',
  }

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg border-l-4 bg-white/60 animate-fade-in',
        typeClasses[entry.type]
      )}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold capitalize text-slate-700">
            {entry.agent.replace('_', ' ')}
          </span>
          <span className="text-xs text-muted-foreground">
            {entry.timestamp.toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm text-slate-600 break-words">{entry.message}</p>
      </div>
    </div>
  )
}

export default function LiveStreamPanel() {
  const { logs, status } = useSessionStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="h-full flex flex-col bg-white/50 rounded-xl border border-slate-200/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            status === 'running' ? 'bg-primary animate-pulse' : 'bg-slate-300'
          )} />
          <h3 className="font-medium text-sm text-slate-700">Live Activity</h3>
        </div>
        <span className="text-xs text-muted-foreground">{logs.length} events</span>
      </div>

      {/* Log list */}
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center p-8">
            <div>
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                <Brain className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                Agent activity will appear here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((entry) => (
              <LogEntryItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

