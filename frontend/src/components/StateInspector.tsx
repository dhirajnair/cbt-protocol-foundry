import { useState } from 'react'
import { ChevronDown, ChevronRight, Code } from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default function StateInspector() {
  const [isExpanded, setIsExpanded] = useState(false)
  const {
    intent,
    currentDraft,
    safetyScore,
    empathyScore,
    iterationCount,
    status,
    threadId,
    activeNode,
    nodes,
  } = useSessionStore()

  // State Inspector shows only CURRENT state (not historical sequence)
  const state = {
    thread_id: threadId,
    intent,
    current_draft: currentDraft,
    safety_score: safetyScore,
    empathy_score: empathyScore,
    iteration_count: iterationCount,
    status,
    active_node: activeNode,
    current_node_status: activeNode ? nodes.find((n) => n.id === activeNode)?.status : null,
  }

  return (
    <div className="bg-white/50 rounded-xl border border-slate-200/50 overflow-hidden dark:bg-slate-900/70 dark:border-slate-800">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/50 dark:hover:bg-slate-800/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-slate-500 dark:text-slate-200" />
          <span className="text-sm font-medium text-foreground">State Inspector</span>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <Badge variant={status === 'running' ? 'info' : status === 'pending_review' ? 'warning' : 'success'}>
              {status}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-300" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-300" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-200/50 dark:border-slate-800 max-h-[360px] overflow-y-auto">
          {/* Quick metrics */}
          <div className="grid grid-cols-3 gap-3 py-3 border-b border-slate-200/50 dark:border-slate-800">
            <MetricCard label="Safety" value={safetyScore} max={100} color="secondary" />
            <MetricCard label="Empathy" value={empathyScore} max={100} color="primary" />
            <MetricCard label="Iterations" value={iterationCount} max={5} color="accent" />
          </div>
          
          {/* Current Activity */}
          {activeNode && (
            <div className="py-3 border-b border-slate-200/50 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Current Activity
              </div>
              <div className="text-sm font-medium text-foreground capitalize">
                {activeNode.replace('_', ' ')} - {nodes.find((n) => n.id === activeNode)?.status || 'idle'}
              </div>
            </div>
          )}
          {!activeNode && status !== 'idle' && (
            <div className="py-3 border-b border-slate-200/50 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Current Activity
              </div>
              <div className="text-sm font-medium text-foreground">
                {status === 'approved' ? 'Completed' : status === 'pending_review' ? 'Awaiting Review' : 'Idle'}
              </div>
            </div>
          )}

          {/* JSON view */}
          <div className="mt-3">
            <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(state, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  max,
  color,
}: {
  label: string
  value: number
  max: number
  color: 'primary' | 'secondary' | 'accent'
}) {
  const percentage = (value / max) * 100
  const colorClasses = {
    primary: 'bg-primary/20 text-primary dark:bg-sky-500/20 dark:text-sky-200',
    secondary: 'bg-secondary/20 text-secondary dark:bg-emerald-500/20 dark:text-emerald-200',
    accent: 'bg-accent/20 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100',
  }

  return (
    <div className="text-center p-2 rounded-lg bg-white/50 dark:bg-slate-800/70">
      <div className={cn('text-lg font-bold', colorClasses[color].split(' ')[1])}>
        {value}
        <span className="text-xs text-muted-foreground">/{max}</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden dark:bg-slate-700">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClasses[color].split(' ')[0])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

