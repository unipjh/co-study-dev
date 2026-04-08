import { getDisplayColor, getColorLabel } from '../../lib/colorUtils'

/**
 * Memo 탭의 개별 annotation 카드
 *
 * @param {{ annotation, onDelete, onScrollTo, onSendToChat }} props
 */
export default function MemoCard({ annotation, onDelete, onScrollTo, onSendToChat }) {
  const colorBg    = getDisplayColor(annotation.color)
  const colorLabel = getColorLabel(annotation.color)

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={{ ...styles.colorDot, background: colorBg }} />
        <span style={styles.colorLabel}>{colorLabel}</span>
        <span style={styles.page}>{annotation.pageIndex + 1}p</span>
        <button
          style={styles.goBtn}
          onClick={() => onScrollTo?.(annotation)}
          title="원문으로 이동"
        >
          ↗
        </button>
        <button
          style={styles.delBtn}
          onClick={() => onDelete?.(annotation.id)}
          title="삭제"
        >
          ×
        </button>
      </div>

      {annotation.text && (
        <p style={styles.source}>"{annotation.text}"</p>
      )}

      {annotation.content ? (
        <p style={styles.content}>{annotation.content}</p>
      ) : (
        <p style={styles.emptyContent}>메모 없음</p>
      )}

      <button style={styles.chatBtn} onClick={() => onSendToChat?.(annotation)}>
        맥락 추가
      </button>
    </div>
  )
}

const styles = {
  card: {
    padding: '10px 14px',
    borderBottom: '1px solid #f0f0f0',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  header: { display: 'flex', alignItems: 'center', gap: 6 },
  colorDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  colorLabel: { fontSize: 11, color: '#888', flex: 1 },
  page: { fontSize: 11, color: '#aaa' },
  goBtn: { fontSize: 12, color: '#888', cursor: 'pointer', padding: '0 2px' },
  delBtn: { fontSize: 14, color: '#ccc', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
  source: {
    fontSize: 11, color: '#888', lineHeight: 1.4, wordBreak: 'break-word',
    borderLeft: '2px solid #e8e8e8', paddingLeft: 8, fontStyle: 'italic',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  content: { fontSize: 13, color: '#333', lineHeight: 1.5, wordBreak: 'break-word' },
  emptyContent: { fontSize: 12, color: '#ccc', fontStyle: 'italic' },
  chatBtn: {
    alignSelf: 'flex-start',
    fontSize: 11, color: '#6366f1', cursor: 'pointer',
    padding: '3px 8px', borderRadius: 4,
    background: '#f0f0ff', border: '1px solid #e0e0ff',
  },
}
