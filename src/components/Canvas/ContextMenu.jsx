import { useEffect } from 'react'

export default function ContextMenu({
  x,
  y,
  mode,
  annotation,
  onClose,
  onMemo,
  onSendToChat,
  onCreateQuiz,
  onSummarizePage,
  onShowMemos,
  onCancelSelection,
  onAddSelection,
  onEditAnnotation,
  onDeleteAnnotation,
}) {
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

  const estimatedWidth = 190
  const left = Math.min(window.innerWidth - estimatedWidth - 8, Math.max(8, x))
  const top = Math.min(window.innerHeight - 230, Math.max(8, y))

  function run(action) {
    action?.(annotation)
    onClose?.()
  }

  return (
    <div
      style={{ ...styles.menu, left, top, width: estimatedWidth }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {mode === 'annotation' ? (
        <>
          <button style={styles.itemDanger} onClick={() => run(onDeleteAnnotation)}>삭제</button>
          <button style={styles.item} onClick={() => run(onEditAnnotation)}>메모 수정</button>
          <button style={styles.item} onClick={() => run(onSendToChat)}>Chat 맥락 추가</button>
        </>
      ) : mode === 'selection' ? (
        <>
          <button style={styles.item} onClick={() => run(onMemo)}>메모 저장</button>
          <button style={styles.item} onClick={() => run(onAddSelection)}>선택 추가</button>
          <button style={styles.item} onClick={() => run(onCreateQuiz)}>선택으로 퀴즈</button>
          <span style={styles.divider} />
          <button style={styles.itemMuted} onClick={() => run(onCancelSelection)}>선택 취소</button>
        </>
      ) : (
        <>
          <button style={styles.item} onClick={() => run(onSummarizePage)}>현재 페이지 요약</button>
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
  itemDanger: {
    border: 'none',
    background: '#fff1f2',
    color: '#be123c',
    borderRadius: 6,
    padding: '8px 9px',
    fontSize: 13,
    fontWeight: 800,
    textAlign: 'left',
    cursor: 'pointer',
  },
  divider: {
    height: 1,
    background: '#eeeeee',
    margin: '3px 2px',
  },
}
