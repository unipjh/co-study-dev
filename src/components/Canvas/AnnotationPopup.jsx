import { useState, useEffect, useRef } from 'react'

const COLORS = [
  { key: 'yellow', bg: '#FFD700', label: '중요' },
  { key: 'blue',   bg: '#6BB5FF', label: '이해필요' },
  { key: 'green',  bg: '#5CCC7F', label: '암기' },
]
const COLOR_BG    = Object.fromEntries(COLORS.map((c) => [c.key, c.bg]))
const COLOR_LABEL = Object.fromEntries(COLORS.map((c) => [c.key, c.label]))

/**
 * 하이라이트 클릭 시 표시되는 인라인 팝업
 * — 메모 조회·수정, Chat으로 보내기, 삭제
 *
 * @param {{ annotation, containerSize, onUpdate, onDelete, onSendToChat, onClose }} props
 */
export default function AnnotationPopup({
  annotation,
  containerSize,
  onUpdate,
  onDelete,
  onSendToChat,
  onClose,
}) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(annotation.content ?? '')
  const ref = useRef(null)

  // annotation이 바뀌면 상태 초기화
  useEffect(() => {
    setContent(annotation.content ?? '')
    setEditing(false)
  }, [annotation.id])

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  if (!containerSize || !annotation.rects?.length) return null

  // 마지막 줄 rect 기준으로 팝업을 하이라이트 아래에 위치
  const lastRect = annotation.rects[annotation.rects.length - 1]
  const POPUP_WIDTH = 248
  let top  = (lastRect.top + lastRect.height) * containerSize.height + 6
  let left = annotation.rects[0].left * containerSize.width
  // 오른쪽 경계 초과 방지
  left = Math.min(left, containerSize.width - POPUP_WIDTH - 4)

  function handleSave() {
    onUpdate?.(annotation.id, { content })
    setEditing(false)
  }

  return (
    <div
      ref={ref}
      style={{ ...styles.popup, top, left, width: POPUP_WIDTH }}
      // 클릭이 selection을 건드리지 않도록
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 헤더: 색상 변경 버튼 + 삭제 */}
      <div style={styles.header}>
        {COLORS.map((c) => (
          <button
            key={c.key}
            title={c.label}
            style={{
              ...styles.colorBtn,
              background: c.bg,
              outline: annotation.color === c.key ? '2px solid #1a1a1a' : 'none',
              outlineOffset: 1,
            }}
            onClick={() => onUpdate?.(annotation.id, { color: c.key })}
          />
        ))}
        <span style={styles.colorLabel}>{COLOR_LABEL[annotation.color]}</span>
        <div style={styles.spacer} />
        <button
          style={styles.deleteBtn}
          onClick={() => onDelete?.(annotation.id)}
          title="삭제"
        >
          ×
        </button>
      </div>

      {/* 원문 텍스트 */}
      <p style={styles.sourceText}>"{annotation.text}"</p>

      {/* 메모 영역 */}
      {editing ? (
        <div style={styles.editArea}>
          <textarea
            autoFocus
            style={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="메모를 입력하세요"
            rows={3}
          />
          <div style={styles.editActions}>
            <button
              style={styles.cancelBtn}
              onClick={() => { setEditing(false); setContent(annotation.content ?? '') }}
            >
              취소
            </button>
            <button style={styles.saveBtn} onClick={handleSave}>저장</button>
          </div>
        </div>
      ) : (
        <div style={styles.memoArea} onClick={() => setEditing(true)} title="클릭해서 수정">
          {content
            ? <p style={styles.memoText}>{content}</p>
            : <p style={styles.memoPlaceholder}>메모 추가...</p>
          }
        </div>
      )}

      {/* Chat으로 보내기 */}
      <button style={styles.chatBtn} onClick={() => onSendToChat?.(annotation)}>
        Chat으로 보내기
      </button>
    </div>
  )
}

const styles = {
  popup: {
    position: 'absolute',
    zIndex: 200,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  header: { display: 'flex', alignItems: 'center', gap: 6 },
  colorBtn: {
    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
    cursor: 'pointer', border: 'none', padding: 0,
  },
  colorLabel: { fontSize: 11, color: '#888', fontWeight: 600, marginLeft: 2 },
  spacer: { flex: 1 },
  deleteBtn: {
    fontSize: 16, color: '#ccc', cursor: 'pointer',
    padding: '0 2px', lineHeight: 1,
  },
  sourceText: {
    fontSize: 11, color: '#999', fontStyle: 'italic', lineHeight: 1.5,
    borderLeft: '2px solid #e8e8e8', paddingLeft: 8,
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  memoArea: { minHeight: 28, cursor: 'text' },
  memoText: { fontSize: 13, color: '#333', lineHeight: 1.5, wordBreak: 'break-word' },
  memoPlaceholder: { fontSize: 13, color: '#bbb' },
  editArea: { display: 'flex', flexDirection: 'column', gap: 6 },
  textarea: {
    resize: 'vertical',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    minHeight: 68,
  },
  editActions: { display: 'flex', justifyContent: 'flex-end', gap: 6 },
  cancelBtn: {
    padding: '4px 10px', borderRadius: 5,
    background: '#f0f0f0', fontSize: 12, cursor: 'pointer',
  },
  saveBtn: {
    padding: '4px 12px', borderRadius: 5,
    background: '#1a1a1a', color: '#fff', fontSize: 12, cursor: 'pointer',
  },
  chatBtn: {
    width: '100%', padding: '6px 0', borderRadius: 6,
    background: '#f0f0ff', color: '#6366f1',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: '1px solid #e0e0ff',
  },
}
