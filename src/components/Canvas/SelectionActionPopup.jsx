import { useEffect, useRef } from 'react'

export default function SelectionActionPopup({
  viewportRect,
  onMemo,
  onSendToChat,
  onCancel,
  onCancelAll,
  onAddSelection,
  onAITutor,
  isRegion = false,
  pendingCount = 0,
}) {
  const ref = useRef(null)

  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onCancel?.()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onCancel])

  if (!viewportRect) return null

  const estimatedWidth = isRegion ? 210 : 380
  const top = Math.max(12, viewportRect.top - 48)
  const left = Math.min(
    window.innerWidth - estimatedWidth - 12,
    Math.max(12, viewportRect.left + viewportRect.width / 2 - estimatedWidth / 2),
  )

  return (
    <div
      ref={ref}
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
        Chat 보내기
      </button>
      {!isRegion && (
        <button style={styles.btn} onClick={onAITutor}>
          즉시질문
        </button>
      )}
      <button style={styles.cancelBtn} onClick={onCancel}>
        선택취소
      </button>
      {!isRegion && (
        <button style={styles.cancelBtn} onClick={onAddSelection}>
          선택 추가
        </button>
      )}
      {(pendingCount > 0 || !isRegion) && (
        <button style={styles.cancelBtn} onClick={onCancelAll}>
          전체취소
        </button>
      )}
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
    maxWidth: 'calc(100vw - 24px)',
    overflowX: 'auto',
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
    flexShrink: 0,
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
    flexShrink: 0,
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
    flexShrink: 0,
  },
}
