import { useMemo, useCallback, useEffect } from 'react'
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'
import MindMapNode from './MindMapNode'
import MindMapEdge from './MindMapEdge'

const NODE_TYPES = { mindmapNode: MindMapNode }
const EDGE_TYPES = { mindmapEdge: MindMapEdge }

const NODE_W = { 3: 160, 2: 136, 1: 112 }
const NODE_H = { 3: 58,  2: 50,  1: 42  }

function applyDagreLayout(rfNodes, rfEdges) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 16, marginy: 16 })

  rfNodes.forEach((n) => {
    g.setNode(n.id, {
      width:  NODE_W[n.data.importance] ?? 136,
      height: NODE_H[n.data.importance] ?? 50,
    })
  })
  rfEdges.forEach((e) => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return rfNodes.map((n) => {
    const { x, y } = g.node(n.id)
    const w = NODE_W[n.data.importance] ?? 136
    const h = NODE_H[n.data.importance] ?? 50
    return { ...n, position: { x: x - w / 2, y: y - h / 2 } }
  })
}

/**
 * 마인드맵 데이터를 React Flow 형식으로 변환
 */
function toRFFormat(nodes = [], edges = []) {
  const rfNodes = nodes.map((n) => ({
    id:   n.id,
    type: 'mindmapNode',
    data: { ...n },
    position: { x: 0, y: 0 },
  }))

  const nodeIds = new Set(rfNodes.map((n) => n.id))
  const rfEdges = edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      id:     e.id,
      source: e.from,
      target: e.to,
      type:   'mindmapEdge',
      data:   { label: e.label, edgeType: e.type },
    }))

  const laidOutNodes = applyDagreLayout(rfNodes, rfEdges)
  return { nodes: laidOutNodes, edges: rfEdges }
}

function Flow({ mindMap }) {
  const { fitView } = useReactFlow()

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => toRFFormat(mindMap?.nodes, mindMap?.edges),
    [mindMap]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // 다른 맵으로 전환 시 dagre 레이아웃으로 리셋
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindMap?.id])

  const onInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
  }, [fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onInit={onInit}
      minZoom={0.3}
      maxZoom={2.0}
      fitView
      style={{ background: '#fafafa' }}
    >
      <Background color="#e5e7eb" gap={20} size={1} />
      <Controls showInteractive={false} style={{ bottom: 12, right: 12, top: 'auto', left: 'auto' }} />
    </ReactFlow>
  )
}

/**
 * @param {{ mindMap: MindMap|null }} props
 */
export default function MindMapCanvas({ mindMap }) {
  if (!mindMap) return null
  return (
    <ReactFlowProvider>
      <Flow mindMap={mindMap} />
    </ReactFlowProvider>
  )
}
