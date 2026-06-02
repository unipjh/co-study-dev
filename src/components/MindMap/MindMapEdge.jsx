import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'

const EDGE_COLOR = {
  causes: '#070761',
  exemplifies: '#278348',
  contrasts: '#6f6fa8',
  contains: '#8585b0',
  related: '#8585b0',
}

export default function MindMapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const color = EDGE_COLOR[data?.edgeType] ?? EDGE_COLOR.related

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: color, strokeWidth: 2, opacity: 0.84 }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              maxWidth: 132,
              padding: '1px 7px',
              borderRadius: 4,
              border: `1px solid ${color}`,
              background: '#ffffff',
              color,
              fontSize: 10,
              lineHeight: '14px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              pointerEvents: 'none',
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
