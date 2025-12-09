import { useCallback, useMemo } from 'react'
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'
import { useSessionStore, type NodeStatus } from '@/store/sessionStore'
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

function AgentNode({ data }: AgentNodeProps) {
  const Icon = data.icon
  const statusClasses = {
    idle: 'bg-slate-100 border-slate-200 text-slate-400',
    active: 'bg-primary-50 border-primary-400 text-primary-600 shadow-lg shadow-primary/20',
    complete: 'bg-secondary/10 border-secondary text-secondary',
    error: 'bg-destructive/10 border-destructive text-destructive',
  }

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-xl border-2 min-w-[140px] transition-all duration-300',
        statusClasses[data.status]
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          data.status === 'active' && 'bg-primary/10',
          data.status === 'complete' && 'bg-secondary/10',
          data.status === 'idle' && 'bg-slate-200/50'
        )}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium">{data.label}</span>
      </div>
      {data.status === 'active' && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          <span className="text-xs text-primary-600">Processing...</span>
        </div>
      )}
    </div>
  )
}

const nodeTypes = {
  agent: AgentNode,
}

export default function AgentGraph() {
  const { nodes: storeNodes } = useSessionStore()

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
          status: storeNodes.find((n) => n.id === 'human_gate')?.status || 'idle',
          icon: nodeIcons.human_gate,
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
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      },
    ],
    [storeNodes]
  )

  const initialEdges: Edge[] = useMemo(
    () => [
      {
        id: 'e-sup-draft',
        source: 'supervisor',
        target: 'drafter',
        animated: storeNodes.find((n) => n.id === 'drafter')?.status === 'active',
        style: { stroke: '#94a3b8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      },
      {
        id: 'e-draft-safe',
        source: 'drafter',
        target: 'safety_guardian',
        animated: storeNodes.find((n) => n.id === 'safety_guardian')?.status === 'active',
        style: { stroke: '#94a3b8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      },
      {
        id: 'e-safe-crit',
        source: 'safety_guardian',
        target: 'clinical_critic',
        animated: storeNodes.find((n) => n.id === 'clinical_critic')?.status === 'active',
        style: { stroke: '#94a3b8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      },
      {
        id: 'e-crit-sup',
        source: 'clinical_critic',
        target: 'supervisor',
        animated: false,
        style: { stroke: '#94a3b8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        type: 'smoothstep',
      },
      {
        id: 'e-sup-human',
        source: 'supervisor',
        target: 'human_gate',
        animated: storeNodes.find((n) => n.id === 'human_gate')?.status === 'active',
        style: { stroke: '#10B981' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
      },
      {
        id: 'e-human-final',
        source: 'human_gate',
        target: 'finalize',
        animated: storeNodes.find((n) => n.id === 'finalize')?.status === 'active',
        style: { stroke: '#10B981' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
      },
    ],
    [storeNodes]
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div className="w-full h-[450px] bg-white/50 rounded-xl border border-slate-200/50 overflow-hidden">
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
      >
        <Background color="#e2e8f0" gap={16} size={1} />
        <Controls
          showInteractive={false}
          className="bg-white/80 border border-slate-200 rounded-lg shadow-sm"
        />
      </ReactFlow>
    </div>
  )
}

