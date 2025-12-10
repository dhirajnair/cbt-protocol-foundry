import { useCallback, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  Position,
  useNodesState,
  useEdgesState,
  Handle,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'
import { useSessionStore, type NodeStatus } from '@/store/sessionStore'
import { useTheme } from '@/hooks/useTheme'
import {
  Brain,
  PenTool,
  Shield,
  Heart,
  User,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react'

interface AgentNodeProps {
  data: {
    label: string
    status: NodeStatus
    icon: LucideIcon
    executionCount: number
  }
}

const nodeIcons: Record<string, LucideIcon> = {
  supervisor: Brain,
  drafter: PenTool,
  safety_guardian: Shield,
  clinical_critic: Heart,
  human_gate: User,
  finalize: CheckCircle,
}

const agentDescriptions: Record<string, string> = {
  supervisor: 'Orchestrates the workflow and routes between agents',
  drafter: 'Generates the initial protocol draft',
  'safety guardian': 'Checks for safety concerns and ethical issues',
  'clinical critic': 'Evaluates clinical quality and empathy',
  'human review': 'Awaiting your review and approval',
  finalize: 'Finalizes the approved protocol',
}

function AgentNode({ data }: AgentNodeProps) {
  const Icon = data.icon
  const statusClasses = {
    idle: 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-900/70 dark:border-slate-800 dark:text-slate-300',
    active: 'bg-primary-50 border-primary-400 text-primary-600 shadow-lg shadow-primary/20 dark:bg-sky-500/10 dark:border-sky-400 dark:text-sky-100 dark:shadow-sky-500/30',
    complete: 'bg-green-50 border-green-400 text-green-700 dark:bg-emerald-500/10 dark:border-emerald-500 dark:text-emerald-100',
    error: 'bg-destructive/10 border-destructive text-destructive dark:bg-red-500/10 dark:border-red-400 dark:text-red-100',
  }

  // Map label to description (handle both "Human Review" and "human review")
  const labelKey = data.label.toLowerCase()
  const description = agentDescriptions[labelKey] || ''

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-xl border-2 min-w-[140px] transition-all duration-300 relative',
        'hover:shadow-md cursor-help',
        statusClasses[data.status]
      )}
      title={description}
    >
      {/* Source handles - for outgoing edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        style={{ background: '#94a3b8', width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        style={{ background: '#94a3b8', width: 8, height: 8 }}
      />
      
      {/* Target handles - for incoming edges */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        style={{ background: '#94a3b8', width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={{ background: '#94a3b8', width: 8, height: 8 }}
      />
      
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          data.status === 'active' && 'bg-primary/10 dark:bg-sky-500/10',
          data.status === 'complete' && 'bg-green-100 dark:bg-emerald-500/20',
          data.status === 'idle' && 'bg-slate-200/50 dark:bg-slate-800'
        )}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{data.label}</span>
          <div className="text-xs text-muted-foreground mt-0.5">
            {data.executionCount} {data.executionCount === 1 ? 'execution' : 'executions'}
          </div>
        </div>
      </div>
      {data.status === 'active' && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          <span className="text-xs text-primary-600">Processing...</span>
        </div>
      )}
      {data.status === 'complete' && (
        <div className="mt-2 flex items-center gap-1.5">
          <CheckCircle className="w-3 h-3 text-green-600" />
          <span className="text-xs text-green-600">Complete</span>
        </div>
      )}
    </div>
  )
}

const nodeTypes = {
  agent: AgentNode,
}

export default function AgentGraph() {
  const { nodes: storeNodes, activeNode, previousNode } = useSessionStore()
  const { theme } = useTheme()

  const initialNodes: Node[] = useMemo(
    () => [
      {
        id: 'supervisor',
        type: 'agent',
        position: { x: 300, y: 0 },
        data: {
          label: 'Supervisor',
          status: storeNodes.find((n) => n.id === 'supervisor')?.status || 'idle',
          icon: nodeIcons.supervisor,
          executionCount: storeNodes.find((n) => n.id === 'supervisor')?.executionCount || 0,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      },
      {
        id: 'drafter',
        type: 'agent',
        position: { x: 100, y: 120 },
        data: {
          label: 'Drafter',
          status: storeNodes.find((n) => n.id === 'drafter')?.status || 'idle',
          icon: nodeIcons.drafter,
          executionCount: storeNodes.find((n) => n.id === 'drafter')?.executionCount || 0,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      },
      {
        id: 'safety_guardian',
        type: 'agent',
        position: { x: 100, y: 240 },
        data: {
          label: 'Safety Guardian',
          status: storeNodes.find((n) => n.id === 'safety_guardian')?.status || 'idle',
          icon: nodeIcons.safety_guardian,
          executionCount: storeNodes.find((n) => n.id === 'safety_guardian')?.executionCount || 0,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      },
      {
        id: 'clinical_critic',
        type: 'agent',
        position: { x: 100, y: 360 },
        data: {
          label: 'Clinical Critic',
          status: storeNodes.find((n) => n.id === 'clinical_critic')?.status || 'idle',
          icon: nodeIcons.clinical_critic,
          executionCount: storeNodes.find((n) => n.id === 'clinical_critic')?.executionCount || 0,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Top,
      },
      {
        id: 'human_gate',
        type: 'agent',
        position: { x: 500, y: 200 },
        data: {
          label: 'Human Review',
          status: activeNode === 'human_gate'
            ? 'active'
            : (storeNodes.find((n) => n.id === 'human_gate')?.status || 'idle'),
          icon: nodeIcons.human_gate,
          executionCount: storeNodes.find((n) => n.id === 'human_gate')?.executionCount || 0,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      },
      {
        id: 'finalize',
        type: 'agent',
        position: { x: 500, y: 340 },
        data: {
          label: 'Finalize',
          status: storeNodes.find((n) => n.id === 'finalize')?.status || 'idle',
          icon: nodeIcons.finalize,
          executionCount: storeNodes.find((n) => n.id === 'finalize')?.executionCount || 0,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      },
    ],
    [storeNodes]
  )

  const initialEdges: Edge[] = useMemo(
    () => {
      // Determine which edge should be animated based on execution sequence
      // Animate edge from previousNode to activeNode to show flow
      const getEdgeAnimation = (source: string, target: string): boolean => {
        if (!activeNode) return false
        // Animate if this edge represents the current transition
        if (previousNode === source && activeNode === target) return true
        // Also animate if target is currently active (for initial states)
        if (activeNode === target && !previousNode) return true
        return false
      }
      
      // All edges are always visible to show workflow structure
      // Animated edges show current flow, traversed edges show completed paths
      return [
      {
        id: 'e-sup-draft',
        source: 'supervisor',
        target: 'drafter',
          animated: getEdgeAnimation('supervisor', 'drafter'),
          style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      },
      {
        id: 'e-draft-safe',
        source: 'drafter',
        target: 'safety_guardian',
          animated: getEdgeAnimation('drafter', 'safety_guardian'),
          style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      },
      {
        id: 'e-safe-crit',
        source: 'safety_guardian',
        target: 'clinical_critic',
          animated: getEdgeAnimation('safety_guardian', 'clinical_critic'),
          style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      },
      {
        id: 'e-crit-sup',
        source: 'clinical_critic',
        target: 'supervisor',
          animated: getEdgeAnimation('clinical_critic', 'supervisor'),
          style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        type: 'smoothstep',
      },
      {
        id: 'e-sup-human',
        source: 'supervisor',
        target: 'human_gate',
          animated: getEdgeAnimation('supervisor', 'human_gate'),
          style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      },
      {
        id: 'e-human-final',
        source: 'human_gate',
        target: 'finalize',
          animated: getEdgeAnimation('human_gate', 'finalize'),
          style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        },
        // Edge for drafter -> supervisor (revision path)
        {
          id: 'e-draft-sup',
          source: 'drafter',
          target: 'supervisor',
          animated: getEdgeAnimation('drafter', 'supervisor'),
          style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
          type: 'smoothstep',
      },
      ]
    },
    [storeNodes, activeNode, previousNode]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes when storeNodes change
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const storeNode = storeNodes.find((n) => n.id === node.id)
        const baseStatus = storeNode?.status || 'idle'
        const hasRun = (storeNode?.executionCount || 0) > 0
        const derivedStatus =
          activeNode === node.id
            ? 'active'
            : baseStatus === 'idle' && hasRun
              ? 'complete'
              : baseStatus
        return {
          ...node,
          data: {
            ...node.data,
            status: derivedStatus,
            executionCount: storeNode?.executionCount || 0,
          },
        }
      })
    )
  }, [storeNodes, activeNode, setNodes])

  // Update edges animation based on execution sequence (previousNode -> activeNode)
  // Ensure edges are ALWAYS visible to show workflow structure
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        // Animate edge if it represents the current transition
        const isCurrentTransition = previousNode === edge.source && activeNode === edge.target
        // Also animate if target is active and no previous node (initial state)
        const isInitialActive = activeNode === edge.target && !previousNode && storeNodes.find((n) => n.id === edge.target)?.status === 'active'
        const shouldAnimate = isCurrentTransition || isInitialActive
        
        // Determine if edge has been traversed (target node has execution count > 0 or is complete)
        const targetNode = storeNodes.find((n) => n.id === edge.target)
        const sourceNode = storeNodes.find((n) => n.id === edge.source)
        const edgeTraversed = (targetNode?.executionCount || 0) > 0 || targetNode?.status === 'complete' || targetNode?.status === 'active'
        
        // ALWAYS show edges - they represent the workflow structure
        // Animated (green) = current transition
        // Traversed (purple) = completed path
        // Inactive (gray) = potential path
        return {
          ...edge,
          animated: shouldAnimate,
          style: { 
            ...edge.style, 
            stroke: shouldAnimate ? '#10B981' : (edgeTraversed ? '#6366f1' : '#94a3b8'),
            strokeWidth: shouldAnimate ? 2.5 : (edgeTraversed ? 1.5 : 1),
            opacity: shouldAnimate ? 1 : (edgeTraversed ? 1 : 0.5), // Always visible, just dimmer for inactive
          },
          markerEnd: { 
            ...edge.markerEnd, 
            color: shouldAnimate ? '#10B981' : (edgeTraversed ? '#6366f1' : '#94a3b8')
          },
        }
      })
    )
  }, [storeNodes, activeNode, previousNode, setEdges])

  return (
    <div className="w-full h-[450px] bg-white/50 rounded-xl border border-slate-200/50 overflow-hidden dark:bg-slate-900/70 dark:border-slate-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
        edgesFocusable={true}
        nodesFocusable={true}
      >
        <Background color={theme === 'dark' ? '#334155' : '#e2e8f0'} gap={16} size={1} />
        <Controls
          showInteractive={false}
          className="bg-white/80 border border-slate-200 rounded-lg shadow-sm dark:bg-slate-800/80 dark:border-slate-700"
        />
      </ReactFlow>
    </div>
  )
}

