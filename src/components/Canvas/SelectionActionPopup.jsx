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

  const estimatedWidth = isRegion ? 250 : 360
  const top = Math.max(12, viewportRect.top - 56)
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
        채팅으로 보내기
      </button>
      {!isRegion && (
        <button style={styles.btn} onClick={onAITutor}>
          AI 즉시 설명
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
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    background: '#ffffff',
    border: '1px solid #d8d8ea',
    boxShadow: '0 12px 28px rgba(7,7,97,0.16)',
    whiteSpace: 'nowrap',
    maxWidth: 'calc(100vw - 24px)',
    overflowX: 'auto',
  },
  btn: {
    border: '1px solid #d9d9ef',
    borderRadius: 6,
    background: '#f1f1fb',
    color: '#070761',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    flexShrink: 0,
  },
  primaryBtn: {
    border: 'none',
    borderRadius: 6,
    background: '#070761',
    color: '#fff',
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    flexShrink: 0,
  },
  cancelBtn: {
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: '#777790',
    padding: '8px 8px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
}
