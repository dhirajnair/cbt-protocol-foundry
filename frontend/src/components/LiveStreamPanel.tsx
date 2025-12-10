import { useEffect, useMemo, useRef, useState } from 'react'
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
  supervisor: 'text-purple-600 bg-purple-50 dark:text-purple-200 dark:bg-purple-500/15',
  drafter: 'text-blue-600 bg-blue-50 dark:text-sky-200 dark:bg-sky-500/15',
  safety_guardian: 'text-amber-600 bg-amber-50 dark:text-amber-200 dark:bg-amber-500/15',
  clinical_critic: 'text-pink-600 bg-pink-50 dark:text-pink-200 dark:bg-pink-500/15',
  human_gate: 'text-cyan-600 bg-cyan-50 dark:text-cyan-200 dark:bg-cyan-500/15',
  finalize: 'text-green-600 bg-green-50 dark:text-emerald-200 dark:bg-emerald-500/15',
  system: 'text-slate-600 bg-slate-50 dark:text-slate-200 dark:bg-slate-800/60',
}

function LogEntryItem({ entry }: { entry: LogEntry }) {
  const Icon = agentIcons[entry.agent] || AlertCircle
  const colorClass = agentColors[entry.agent] || agentColors.system
  
  const typeClasses = {
    info: 'border-l-slate-300 dark:border-l-slate-600',
    success: 'border-l-secondary dark:border-l-emerald-500',
    warning: 'border-l-accent dark:border-l-amber-400',
    error: 'border-l-destructive dark:border-l-red-400',
  }

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg border-l-4 bg-white/60 animate-fade-in dark:bg-slate-900/70 dark:border-slate-800',
        typeClasses[entry.type]
      )}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold capitalize text-foreground">
            {entry.agent.replace('_', ' ')}
          </span>
          <span className="text-xs text-muted-foreground">
            {entry.timestamp.toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm text-foreground break-words mb-2">{entry.message}</p>
      </div>
    </div>
  )
}

export default function LiveStreamPanel() {
  const { logs, status } = useSessionStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const orderedLogs = useMemo(() => [...logs].reverse(), [logs])
  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(new Set())
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set())

  // Keep newest at top; snap to top on updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
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
        {orderedLogs.length === 0 ? (
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
            {orderedLogs.map((entry) => {
              const inputOpen = expandedInputs.has(entry.id)
              const outputOpen = expandedOutputs.has(entry.id)
              return (
                <div key={entry.id}>
                  <LogEntryItem entry={entry} />
                  {(entry.input || entry.output) && (
                    <div className="mt-2 space-y-1">
                      {entry.input && (
                        <button
                          onClick={() => {
                            const next = new Set(expandedInputs)
                            next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id)
                            setExpandedInputs(next)
                          }}
                          className="text-xs font-semibold text-slate-600 dark:text-slate-200 uppercase tracking-wide hover:text-primary transition-colors"
                        >
                          {inputOpen ? 'Hide Input' : 'Show Input'}
                        </button>
                      )}
                      {entry.output && (
                        <button
                          onClick={() => {
                            const next = new Set(expandedOutputs)
                            next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id)
                            setExpandedOutputs(next)
                          }}
                          className="ml-3 text-xs font-semibold text-slate-600 dark:text-slate-200 uppercase tracking-wide hover:text-primary transition-colors"
                        >
                          {outputOpen ? 'Hide Output' : 'Show Output'}
                        </button>
                      )}
                    </div>
                  )}
                  {inputOpen && entry.input && (
                    <div className="mt-2 text-xs text-slate-700 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/70 p-2 rounded border border-slate-200/50 dark:border-slate-700 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {entry.input}
                    </div>
                  )}
                  {outputOpen && entry.output && (
                    <div className="mt-2 text-xs text-slate-700 dark:text-slate-100 bg-blue-50/80 dark:bg-slate-800/70 p-2 rounded border border-blue-200/50 dark:border-slate-700 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {entry.output}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

