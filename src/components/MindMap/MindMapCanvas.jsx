import { useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'
import MindMapNode from './MindMapNode'
import MindMapEdge from './MindMapEdge'

const NODE_TYPES = { mindmapNode: MindMapNode }
const EDGE_TYPES = { mindmapEdge: MindMapEdge }

const NODE_W = { 3: 178, 2: 158, 1: 146 }
const NODE_H = { 3: 48, 2: 42, 1: 38 }

function applyDagreLayout(rfNodes, rfEdges) {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', nodesep: 42, ranksep: 96, marginx: 30, marginy: 30 })

  rfNodes.forEach((node) => {
    graph.setNode(node.id, {
      width: NODE_W[node.data.importance] ?? NODE_W[2],
      height: NODE_H[node.data.importance] ?? NODE_H[2],
    })
  })
  rfEdges.forEach((edge) => graph.setEdge(edge.source, edge.target))

  dagre.layout(graph)

  return rfNodes.map((node) => {
    const { x, y } = graph.node(node.id)
    const width = NODE_W[node.data.importance] ?? NODE_W[2]
    const height = NODE_H[node.data.importance] ?? NODE_H[2]
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } }
  })
}

function toRFFormat(nodes = [], edges = []) {
  const rfNodes = [...nodes].sort(compareMindMapNodes).map((node) => ({
    id: node.id,
    type: 'mindmapNode',
    data: { ...node },
    position: { x: 0, y: 0 },
  }))

  const nodeIds = new Set(rfNodes.map((node) => node.id))
  const rfEdges = edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'mindmapEdge',
      data: { label: edge.label, edgeType: edge.type },
    }))

  return { nodes: applyDagreLayout(rfNodes, rfEdges), edges: rfEdges }
}

function compareMindMapNodes(a, b) {
  const levelA = Number.isInteger(a.level) ? a.level : 2
  const levelB = Number.isInteger(b.level) ? b.level : 2
  if (levelA !== levelB) return levelA - levelB
  if (a.root && !b.root) return -1
  if (!a.root && b.root) return 1
  return String(a.label ?? '').localeCompare(String(b.label ?? ''), 'ko')
}

function Flow({ mindMap }) {
  const { fitView } = useReactFlow()
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => toRFFormat(mindMap?.nodes, mindMap?.edges),
    [mindMap]
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    window.setTimeout(() => fitView({ padding: 0.14, duration: 300 }), 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindMap?.id])

  const onInit = useCallback(() => {
    window.setTimeout(() => fitView({ padding: 0.14, duration: 300 }), 50)
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
      minZoom={0.25}
      maxZoom={1.8}
      fitView
      style={styles.flow}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e9e9f2" gap={20} size={1} />
      <Controls
        showInteractive={false}
        position="bottom-right"
        style={styles.controls}
      />
    </ReactFlow>
  )
}

export default function MindMapCanvas({ mindMap }) {
  if (!mindMap) return null
  return (
    <ReactFlowProvider>
      <Flow mindMap={mindMap} />
    </ReactFlowProvider>
  )
}

const styles = {
  flow: {
    flex: 1,
    background: '#fbfbfd',
  },
  controls: {
    right: 40,
    bottom: 40,
    boxShadow: '0 4px 4px rgba(0,0,0,0.25)',
  },
}
