import { useRef, useState } from 'react'
import { getDisplayColor, getColorLabel } from '../../lib/colorUtils'

function getSourceText(annotation) {
  if (annotation.imageData) return '[이미지 영역]'
  if (annotation.text) return annotation.text
  return annotation.content ? '[영역 선택]' : ''
}

export default function MemoCard({ annotation, onDelete, onScrollTo, onSendToChat }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimerRef = useRef(null)

  const colorBg = getDisplayColor(annotation.color)
  const colorLabel = getColorLabel(annotation.color)
  const sourceText = getSourceText(annotation)

  function handleDeleteClick() {
    if (confirmDelete) {
      clearTimeout(confirmTimerRef.current)
      onDelete?.(annotation.id)
      return
    }

    setConfirmDelete(true)
    confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
  }

  return (
    <article style={styles.card}>
      <div style={styles.topLine}>
        <div style={styles.labelGroup}>
          <span style={{ ...styles.colorDot, background: colorBg }} />
          <span style={styles.colorLabel}>{colorLabel}</span>
        </div>

        <div style={styles.actions}>
          <span style={styles.page}>{annotation.pageIndex + 1}p</span>
          <button
            type="button"
            style={styles.iconButton}
            onClick={() => onScrollTo?.(annotation)}
            aria-label="원문으로 이동"
            title="원문으로 이동"
          >
            ↗
          </button>
          <button
            type="button"
            style={confirmDelete ? styles.deleteConfirm : styles.iconButton}
            onClick={handleDeleteClick}
            aria-label={confirmDelete ? '삭제 확인' : '메모 삭제'}
            title={confirmDelete ? '한 번 더 클릭하면 삭제됩니다' : '메모 삭제'}
          >
            {confirmDelete ? '삭제?' : '×'}
          </button>
        </div>
      </div>

      {sourceText && (
        <blockquote style={styles.source}>
          {sourceText}
        </blockquote>
      )}

      {annotation.content ? (
        <p style={styles.content}>{annotation.content}</p>
      ) : (
        <p style={styles.emptyContent}>메모 없음</p>
      )}

      <button
        type="button"
        style={styles.contextButton}
        onClick={() => onSendToChat?.(annotation)}
      >
        맥락 추가
      </button>
    </article>
  )
}

const styles = {
  card: {
    minHeight: 180,
    padding: '14px 17px 14px 28px',
    borderBottom: '1px solid #eeeeee',
    background: '#ffffff',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  topLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    minHeight: 20,
  },
  labelGroup: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  colorDot: {
    width: 15,
    height: 15,
    borderRadius: '50%',
    flexShrink: 0,
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
  },
  colorLabel: {
    minWidth: 0,
    color: '#6e6e6e',
    fontSize: 12.5,
    lineHeight: '20px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    flexShrink: 0,
  },
  page: {
    color: '#6e6e6e',
    fontSize: 12,
    lineHeight: '20px',
    fontWeight: 500,
  },
  iconButton: {
    width: 15,
    height: 20,
    padding: 0,
    color: '#6e6e6e',
    fontSize: 18,
    lineHeight: '18px',
    fontWeight: 400,
    textAlign: 'center',
  },
  deleteConfirm: {
    minWidth: 38,
    height: 22,
    padding: '2px 6px',
    borderRadius: 5,
    background: '#fff0f0',
    border: '1px solid #fca5a5',
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 800,
  },
  source: {
    marginTop: 2,
    marginLeft: 1,
    paddingLeft: 17,
    minHeight: 54,
    borderLeft: '2px solid #cfcfcf',
    color: 'rgba(0,0,0,0.25)',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 400,
    wordBreak: 'break-word',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  content: {
    color: '#000000',
    fontSize: 15,
    lineHeight: '20px',
    fontWeight: 500,
    wordBreak: 'break-word',
    paddingRight: 98,
  },
  emptyContent: {
    color: '#000000',
    fontSize: 15,
    lineHeight: '20px',
    fontWeight: 500,
    opacity: 0.5,
    paddingRight: 98,
  },
  contextButton: {
    alignSelf: 'flex-end',
    marginTop: 'auto',
    width: 80,
    height: 25,
    borderRadius: 5,
    background: '#eeeef8',
    color: '#070761',
    fontSize: 12,
    lineHeight: '20px',
    fontWeight: 700,
  },
}
