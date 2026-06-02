import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import useDocumentStore from '../../store/documentStore'

const SIZE = {
  3: { width: 178, fontSize: 14, padding: '10px 18px', fontWeight: 900 },
  2: { width: 158, fontSize: 13, padding: '9px 15px', fontWeight: 800 },
  1: { width: 146, fontSize: 12, padding: '8px 13px', fontWeight: 800 },
}

const GROUP = {
  root: { bg: '#070761', border: '#070761', text: '#ffffff', page: 'rgba(255,255,255,0.62)' },
  core: { bg: '#070761', border: '#070761', text: '#ffffff', page: 'rgba(255,255,255,0.62)' },
  process: { bg: '#e8fff4', border: '#41ffa7', text: '#070761', page: 'rgba(7,7,97,0.48)' },
  structure: { bg: '#eeeef8', border: '#b9b9dc', text: '#070761', page: 'rgba(7,7,97,0.48)' },
  effect: { bg: '#ffffff', border: '#41ffa7', text: '#070761', page: 'rgba(7,7,97,0.48)' },
  example: { bg: '#f8f8ff', border: '#c8c8e6', text: '#070761', page: 'rgba(7,7,97,0.44)' },
  application: { bg: '#ffffff', border: '#070761', text: '#070761', page: 'rgba(7,7,97,0.48)' },
  default: { bg: '#f8f8fc', border: '#d7d7e8', text: '#070761', page: 'rgba(7,7,97,0.42)' },
}

export default function MindMapNode({ data }) {
  const [hovered, setHovered] = useState(false)
  const setCurrentPage = useDocumentStore((state) => state.setCurrentPage)

  const size = SIZE[data.importance] ?? SIZE[2]
  const color = GROUP[data.group] ?? GROUP.default
  const pageIndex = data.sources?.[0]?.pageIndex

  function handleClick() {
    if (pageIndex != null) {
      setCurrentPage(pageIndex + 1)
    }
  }

  return (
    <div
      style={{
        ...styles.node,
        width: size.width,
        padding: size.padding,
        background: color.bg,
        borderColor: color.border,
        cursor: pageIndex != null ? 'pointer' : 'default',
        boxShadow: hovered ? '0 6px 18px rgba(7,7,97,0.18)' : '0 2px 8px rgba(7,7,97,0.10)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />

      <div
        style={{
          color: color.text,
          fontSize: size.fontSize,
          fontWeight: size.fontWeight,
          lineHeight: '20px',
          textAlign: 'center',
          wordBreak: 'keep-all',
        }}
      >
        {data.label}
      </div>

      {pageIndex != null && (
        <div style={{ ...styles.pageHint, color: color.page }}>p.{pageIndex + 1}</div>
      )}

      {hovered && (data.detail || data.sources?.[0]?.quote) && (
        <div style={styles.tooltip}>
          {data.detail && <div style={styles.tooltipDetail}>{data.detail}</div>}
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
  node: {
    minHeight: 38,
    border: '2px solid',
    borderRadius: 8,
    position: 'relative',
    userSelect: 'none',
    transition: 'box-shadow 0.15s, transform 0.15s',
  },
  pageHint: {
    position: 'absolute',
    right: 7,
    bottom: 4,
    color: 'rgba(0,0,0,0.28)',
    fontSize: 10,
    lineHeight: '10px',
    fontWeight: 700,
  },
  tooltip: {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 220,
    zIndex: 20,
    pointerEvents: 'none',
    borderRadius: 6,
    padding: '9px 11px',
    background: '#111111',
    color: '#ffffff',
    boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
  },
  tooltipDetail: {
    fontSize: 11,
    lineHeight: '17px',
    color: 'rgba(255,255,255,0.9)',
  },
  tooltipQuote: {
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px solid rgba(255,255,255,0.16)',
    fontSize: 10,
    lineHeight: '16px',
    color: 'rgba(255,255,255,0.58)',
    fontStyle: 'italic',
  },
}
