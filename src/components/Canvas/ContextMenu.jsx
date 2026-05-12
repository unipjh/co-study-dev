import { useEffect } from 'react'

export default function ContextMenu({ x, y, mode, onClose, onMemo, onSendToChat, onCreateQuiz, onShowMemos, onCancelSelection }) {
  useEffect(() => {
    function close() { onClose?.() }
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const estimatedWidth = 178
  const left = Math.min(window.innerWidth - estimatedWidth - 8, Math.max(8, x))
  const top = Math.min(window.innerHeight - 210, Math.max(8, y))
  const selectionMode = mode === 'selection'

  function run(action) {
    action?.()
    onClose?.()
  }

  return (
    <div
      style={{ ...styles.menu, left, top, width: estimatedWidth }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {selectionMode ? (
        <>
          <button style={styles.item} onClick={() => run(onMemo)}>메모 남기기</button>
          <button style={styles.item} onClick={() => run(onSendToChat)}>Chat에 보내기</button>
          <button style={styles.item} onClick={() => run(onCreateQuiz)}>선택으로 퀴즈</button>
          <span style={styles.divider} />
          <button style={styles.itemMuted} onClick={() => run(onCancelSelection)}>선택 취소</button>
        </>
      ) : (
        <>
          <button style={styles.item} onClick={() => run(onCreateQuiz)}>현재 페이지 퀴즈</button>
          <button style={styles.item} onClick={() => run(onShowMemos)}>페이지 메모 보기</button>
        </>
      )}
    </div>
  )
}

const styles = {
  menu: {
    position: 'fixed',
    zIndex: 1200,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 6,
    borderRadius: 8,
    background: '#fff',
    border: '1px solid #d8d8d8',
    boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
  },
  item: {
    border: 'none',
    background: 'transparent',
    color: '#222',
    borderRadius: 6,
    padding: '8px 9px',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'left',
    cursor: 'pointer',
  },
  itemMuted: {
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    borderRadius: 6,
    padding: '8px 9px',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'left',
    cursor: 'pointer',
  },
  divider: {
    height: 1,
    background: '#eeeeee',
    margin: '3px 2px',
  },
}
