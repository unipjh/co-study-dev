import { useEffect, useRef } from 'react'

/**
 * 텍스트 선택 후 AI 즉시 설명 인라인 팝업
 * 스트리밍 완료 후 "메모로 저장" / "Chat으로 이어보기" 제공
 *
 * @param {{ viewportRect, selectedText, response, isStreaming, onSaveAsMemo, onSendToChat, onClose }} props
 */
export default function AIInlinePopup({
  viewportRect,
  selectedText,
  response,
  isStreaming,
  onSaveAsMemo,
  onSendToChat,
  onClose,
}) {
  const ref = useRef(null)

  // 스트리밍 중 외부 클릭 무시, 완료 후 닫기
  useEffect(() => {
    if (isStreaming) return
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isStreaming, onClose])

  if (!viewportRect) return null

  const popupHeight = 290
  const flipDown = viewportRect.top < popupHeight + 8
  const top = flipDown
    ? viewportRect.bottom + 8
    : viewportRect.top - popupHeight - 8
  const left = viewportRect.left + viewportRect.width / 2

  return (
    <div
      ref={ref}
      style={{ ...styles.container, top, left, transform: 'translateX(-50%)' }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {/* 헤더 */}
      <div style={styles.header}>
        <span style={styles.icon}>💡</span>
        <span style={styles.title}>AI 즉시 설명</span>
        <button style={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {/* 선택된 원문 */}
      <div style={styles.sourceBox}>
        <p style={styles.sourceText}>"{selectedText}"</p>
      </div>

      {/* AI 응답 */}
      <div style={styles.responseBox}>
        {response ? (
          <p style={styles.responseText}>
            {response}
            {isStreaming && <span style={styles.cursor}>▌</span>}
          </p>
        ) : (
          <p style={styles.loadingText}>
            설명 생성 중<span style={styles.cursor}>▌</span>
          </p>
        )}
      </div>

      {/* 액션 버튼 — 스트리밍 완료 후 표시 */}
      {!isStreaming && response && (
        <div style={styles.actions}>
          <button style={styles.saveBtn} onClick={onSaveAsMemo}>
            메모로 저장
          </button>
          <button style={styles.chatBtn} onClick={onSendToChat}>
            Chat으로 이어보기
          </button>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    zIndex: 1001,
    background: '#1a1a1a',
    borderRadius: 10,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    width: 290,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 12px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  icon: { fontSize: 14 },
  title: { fontSize: 12, color: '#a78bfa', fontWeight: 700, flex: 1 },
  closeBtn: { fontSize: 16, color: '#666', cursor: 'pointer', lineHeight: 1, padding: '0 2px' },
  sourceBox: {
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  sourceText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.4,
    fontStyle: 'italic',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  responseBox: {
    padding: '10px 12px',
    maxHeight: 160,
    overflowY: 'auto',
  },
  responseText: {
    fontSize: 13,
    color: '#fff',
    lineHeight: 1.65,
    whiteSpace: 'pre-wrap',
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.65,
  },
  cursor: { color: '#a78bfa' },
  actions: {
    display: 'flex',
    gap: 6,
    padding: '8px 12px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  saveBtn: {
    flex: 1,
    padding: '5px 0',
    borderRadius: 5,
    background: 'rgba(167,139,250,0.15)',
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid rgba(167,139,250,0.3)',
  },
  chatBtn: {
    flex: 1,
    padding: '5px 0',
    borderRadius: 5,
    background: '#fff',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
}
