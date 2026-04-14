import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'

const EDGE_COLOR = {
  causes:      '#ef4444',
  exemplifies: '#8b5cf6',
  contrasts:   '#f97316',
  contains:    '#64748b',
  related:     '#94a3b8',
}

export default function MindMapEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const color = EDGE_COLOR[data?.edgeType] ?? EDGE_COLOR.related

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: color, strokeWidth: 1.5, opacity: 0.75 }}
        markerEnd={`url(#arrow-${data?.edgeType ?? 'related'})`}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 10,
              fontWeight: 600,
              color,
              background: '#fff',
              border: `1px solid ${color}`,
              borderRadius: 4,
              padding: '1px 5px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              opacity: 0.9,
            }}
            className="nodrag nopan"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
