export default function SelectionActionPopup({
  viewportRect,
  onMemo,
  onSendToChat,
  onCancel,
  onAITutor,
  onCreateQuiz,
  isRegion = false,
}) {
  if (!viewportRect) return null

  const estimatedWidth = isRegion ? 190 : 270
  const top = Math.max(12, viewportRect.top - 48)
  const left = Math.min(
    window.innerWidth - estimatedWidth - 12,
    Math.max(12, viewportRect.left + viewportRect.width / 2 - estimatedWidth / 2),
  )

  return (
    <div
      style={{ ...styles.wrap, top, left }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      {!isRegion && (
        <button style={styles.primaryBtn} onClick={onMemo}>
          메모
        </button>
      )}
      <button style={styles.btn} onClick={onSendToChat}>
        Chat에 보내기
      </button>
      {!isRegion && (
        <button style={styles.btn} onClick={onAITutor}>
          AI 설명
        </button>
      )}
      {!isRegion && (
        <button style={styles.btn} onClick={onCreateQuiz}>
          Quiz
        </button>
      )}
      <button style={styles.cancelBtn} onClick={onCancel}>
        취소
      </button>
    </div>
  )
}

const styles = {
  wrap: {
    position: 'fixed',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    borderRadius: 8,
    background: '#1f2937',
    boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
    whiteSpace: 'nowrap',
  },
  btn: {
    border: 'none',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    padding: '6px 9px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryBtn: {
    border: 'none',
    borderRadius: 6,
    background: '#fff',
    color: '#111827',
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  cancelBtn: {
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: 'rgba(255,255,255,0.72)',
    padding: '6px 8px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
}
