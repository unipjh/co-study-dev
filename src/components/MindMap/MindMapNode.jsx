import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import useDocumentStore from '../../store/documentStore'

const SIZE = {
  3: { width: 160, fontSize: 14, padding: '10px 14px', fontWeight: 700 },
  2: { width: 136, fontSize: 13, padding: '8px 12px', fontWeight: 600 },
  1: { width: 112, fontSize: 12, padding: '6px 10px', fontWeight: 500 },
}

const GROUP = {
  core:      { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  process:   { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  structure: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  effect:    { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  default:   { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
}

export default function MindMapNode({ data }) {
  const [hovered, setHovered] = useState(false)
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage)

  const sz  = SIZE[data.importance] ?? SIZE[2]
  const col = GROUP[data.group]     ?? GROUP.default

  function handleClick() {
    const firstSource = data.sources?.[0]
    if (firstSource != null) {
      setCurrentPage(firstSource.pageIndex + 1)
    }
  }

  return (
    <div
      style={{
        width: sz.width,
        background: col.bg,
        border: `2px solid ${col.border}`,
        borderRadius: 10,
        padding: sz.padding,
        cursor: data.sources?.length ? 'pointer' : 'default',
        position: 'relative',
        boxShadow: hovered ? '0 4px 14px rgba(0,0,0,0.15)' : '0 1px 4px rgba(0,0,0,0.08)',
        transition: 'box-shadow 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Top}    style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />

      <div style={{ fontSize: sz.fontSize, fontWeight: sz.fontWeight, color: col.text, textAlign: 'center', lineHeight: 1.35 }}>
        {data.label}
      </div>

      {/* 페이지 이동 힌트 */}
      {data.sources?.length > 0 && (
        <div style={styles.pageHint}>p.{data.sources[0].pageIndex + 1}</div>
      )}

      {/* Hover 툴팁 */}
      {hovered && (data.detail || data.sources?.[0]?.quote) && (
        <div style={styles.tooltip}>
          {data.detail && (
            <div style={styles.tooltipDetail}>{data.detail}</div>
          )}
          {data.sources?.[0]?.quote && (
            <div style={styles.tooltipQuote}>"{data.sources[0].quote}"</div>
          )}
        </div>
      )}
    </div>
  )
}

const handleStyle = { width: 0, height: 0, opacity: 0, border: 'none', minWidth: 0, minHeight: 0 }

const styles = {
  pageHint: {
    position: 'absolute',
    bottom: 3,
    right: 5,
    fontSize: 9,
    color: 'rgba(0,0,0,0.28)',
    fontWeight: 500,
    lineHeight: 1,
  },
  tooltip: {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    padding: '9px 11px',
    width: 210,
    zIndex: 9999,
    pointerEvents: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.32)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  tooltipDetail: {
    fontSize: 11,
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.9)',
  },
  tooltipQuote: {
    fontSize: 10,
    lineHeight: 1.5,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.5)',
    borderTop: '1px solid rgba(255,255,255,0.15)',
    paddingTop: 6,
  },
}
