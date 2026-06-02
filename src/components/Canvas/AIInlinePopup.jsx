import { useEffect, useRef } from 'react'

/**
 * 텍스트 선택 후 AI 즉시 설명 인라인 팝업
 * 스트리밍 완료 후 "메모로 저장" / "더 질문하기" 제공
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

  const popupHeight = 275
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
        <span style={styles.title}>Ai 즉시 설명</span>
        <button style={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {/* 선택된 원문 */}
      <div style={styles.sourceBox}>
        <p style={styles.sourceText}>{selectedText || '내용 내용 글자 크기 13 행간 18'}</p>
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
            더 질문하기
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
    background: '#ffffff',
    border: '1px solid #d8d8ea',
    borderRadius: 4,
    boxShadow: '0 14px 32px rgba(7,7,97,0.16)',
    width: 295,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '18px 20px 16px',
    borderBottom: 'none',
  },
  icon: { fontSize: 14 },
  title: { fontSize: 16, color: '#070761', fontWeight: 900, flex: 1 },
  closeBtn: { fontSize: 16, color: '#8c8c9e', cursor: 'pointer', lineHeight: 1, padding: '0 2px' },
  sourceBox: {
    padding: '14px 20px',
    background: '#eeeef8',
    borderBottom: 'none',
  },
  sourceText: {
    fontSize: 13,
    color: '#8582b2',
    lineHeight: '18px',
    fontStyle: 'normal',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  responseBox: {
    padding: '23px 20px 16px',
    maxHeight: 150,
    overflowY: 'auto',
  },
  responseText: {
    fontSize: 13,
    color: '#111111',
    lineHeight: '22px',
    fontWeight: 800,
    whiteSpace: 'pre-wrap',
  },
  loadingText: {
    fontSize: 13,
    color: '#8582b2',
    lineHeight: 1.65,
  },
  cursor: { color: '#070761' },
  actions: {
    display: 'flex',
    gap: 10,
    padding: '12px 20px 10px',
    borderTop: '1px solid #eeeeF6',
  },
  saveBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 5,
    background: '#efeffa',
    color: '#070761',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
  },
  chatBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 5,
    background: '#070761',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
}
