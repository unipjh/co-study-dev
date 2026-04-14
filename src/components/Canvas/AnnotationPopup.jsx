import { useState, useEffect, useRef } from 'react'
import {
  PRESET_COLORS,
  loadCustomColors,
  saveCustomColor,
  removeCustomColor,
  getDisplayColor,
  getColorLabel,
} from '../../lib/colorUtils'

// AI 전용 purple 제외한 팔레트 표시용 프리셋
const VISIBLE_PRESETS = PRESET_COLORS.filter((c) => c.key !== 'purple')

/**
 * 하이라이트 클릭 시 표시되는 인라인 팝업
 * — 메모 조회·수정, Chat으로 보내기, 삭제
 * — 프리셋 3색 + 커스텀 색상 변경 지원 (staged 확인)
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
  const [editing, setEditing]         = useState(false)
  const [content, setContent]         = useState(annotation.content ?? '')
  const [dragOffset, setDragOffset]   = useState({ x: 0, y: 0 })
  const [customColors, setCustomColors] = useState(loadCustomColors)
  const [stagedColor, setStagedColor] = useState(null)  // 커스텀 색상 확인 대기 중
  const ref      = useRef(null)
  const inputRef = useRef(null)

  // annotation이 바뀌면 상태 초기화
  useEffect(() => {
    setContent(annotation.content ?? '')
    setEditing(false)
    setDragOffset({ x: 0, y: 0 })
    setStagedColor(null)
  }, [annotation.id])

  function startDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const base = { ...dragOffset }

    function onMove(ev) {
      setDragOffset({ x: base.x + ev.clientX - startX, y: base.y + ev.clientY - startY })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

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
  const POPUP_WIDTH = 260
  let top  = (lastRect.top + lastRect.height) * containerSize.height + 6 + dragOffset.y
  let left = annotation.rects[0].left * containerSize.width + dragOffset.x
  // 오른쪽 경계 초과 방지 (드래그 중에는 적용 안 함)
  if (dragOffset.x === 0) left = Math.min(left, containerSize.width - POPUP_WIDTH - 4)

  function handleSave() {
    onUpdate?.(annotation.id, { content })
    setEditing(false)
  }

  function handlePresetColorClick(colorKey) {
    setStagedColor(null)
    onUpdate?.(annotation.id, { color: colorKey })
  }

  function handleCustomColorClick(hex) {
    setStagedColor(null)
    onUpdate?.(annotation.id, { color: hex })
  }

  function handleCustomColorChange(e) {
    setStagedColor(e.target.value)
  }

  function handleConfirmCustomColor() {
    if (!stagedColor) return
    const next = saveCustomColor(stagedColor, customColors)
    setCustomColors(next)
    onUpdate?.(annotation.id, { color: stagedColor })
    setStagedColor(null)
  }

  function handleCancelCustomColor() {
    setStagedColor(null)
  }

  function handleRemoveCustom(e, hex) {
    e.stopPropagation()
    const next = removeCustomColor(hex, customColors)
    setCustomColors(next)
  }

  const displayLabel = getColorLabel(annotation.color)

  return (
    <div
      ref={ref}
      style={{ ...styles.popup, top, left, width: POPUP_WIDTH }}
      // 클릭이 selection을 건드리지 않도록
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 드래그 핸들 */}
      <div style={styles.dragHandle} onMouseDown={startDrag} title="드래그하여 이동">
        ⠿
      </div>

      {/* 헤더: 색상 변경 + 삭제 */}
      <div style={styles.header}>
        {/* 프리셋 색상 */}
        {VISIBLE_PRESETS.map((c) => (
          <button
            key={c.key}
            title={c.label}
            style={{
              ...styles.colorBtn,
              background: c.hex,
              outline: annotation.color === c.key || annotation.color === c.hex ? '2px solid #1a1a1a' : 'none',
              outlineOffset: 1,
            }}
            onClick={() => handlePresetColorClick(c.key)}
          />
        ))}

        {/* 커스텀 색상 목록 */}
        {customColors.map((hex) => (
          <div key={hex} style={styles.customBtnWrap}>
            <button
              title={hex}
              style={{
                ...styles.colorBtn,
                background: hex,
                outline: annotation.color === hex ? '2px solid #1a1a1a' : 'none',
                outlineOffset: 1,
              }}
              onClick={() => handleCustomColorClick(hex)}
            />
            <button
              style={styles.removeBtn}
              onClick={(e) => handleRemoveCustom(e, hex)}
              title="제거"
            >
              ×
            </button>
          </div>
        ))}

        {/* + 커스텀 색상 추가 */}
        {!stagedColor && (
          <button
            title="색상 추가"
            style={styles.addBtn}
            onClick={() => { setStagedColor('#FF5733'); inputRef.current?.click() }}
          >
            +
          </button>
        )}
        <input
          ref={inputRef}
          type="color"
          style={styles.hiddenInput}
          value={stagedColor ?? '#FF5733'}
          onChange={handleCustomColorChange}
        />

        {/* 커스텀 색상 스테이징 확인 */}
        {stagedColor && (
          <>
            <div
              style={{ ...styles.colorBtn, background: stagedColor, border: '2px solid rgba(0,0,0,0.3)', cursor: 'pointer' }}
              title={`선택 중: ${stagedColor}`}
              onClick={() => inputRef.current?.click()}
            />
            <button style={styles.confirmBtn} onClick={handleConfirmCustomColor} title="이 색상으로 확정">✓</button>
            <button style={styles.cancelCustomBtn} onClick={handleCancelCustomColor} title="취소">✗</button>
          </>
        )}

        {!stagedColor && (
          <>
            <span style={styles.colorLabel}>{displayLabel}</span>
            <div style={styles.spacer} />
          </>
        )}
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
  dragHandle: {
    textAlign: 'center',
    fontSize: 14,
    color: '#ccc',
    cursor: 'grab',
    userSelect: 'none',
    lineHeight: 1,
    paddingBottom: 4,
    borderBottom: '1px solid #f0f0f0',
    marginBottom: 4,
  },
  header: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap', minHeight: 22 },
  colorBtn: {
    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
    cursor: 'pointer', border: 'none', padding: 0,
  },
  customBtnWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 11,
    height: 11,
    borderRadius: '50%',
    background: '#aaa',
    color: '#fff',
    fontSize: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    border: 'none',
    padding: 0,
  },
  addBtn: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '1.5px dashed #bbb',
    cursor: 'pointer',
    flexShrink: 0,
    fontSize: 10,
    color: '#999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    background: 'transparent',
    padding: 0,
  },
  hiddenInput: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  confirmBtn: {
    fontSize: 12,
    color: '#22c55e',
    cursor: 'pointer',
    padding: '0 1px',
    background: 'transparent',
    border: 'none',
    lineHeight: 1,
    fontWeight: 700,
    flexShrink: 0,
  },
  cancelCustomBtn: {
    fontSize: 12,
    color: '#ef4444',
    cursor: 'pointer',
    padding: '0 1px',
    background: 'transparent',
    border: 'none',
    lineHeight: 1,
    fontWeight: 700,
    flexShrink: 0,
  },
  colorLabel: { fontSize: 11, color: '#888', fontWeight: 600, marginLeft: 2, flexShrink: 0 },
  spacer: { flex: 1 },
  deleteBtn: {
    fontSize: 16, color: '#ccc', cursor: 'pointer',
    padding: '0 2px', lineHeight: 1, flexShrink: 0,
    background: 'transparent', border: 'none',
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
    border: 'none',
  },
  saveBtn: {
    padding: '4px 12px', borderRadius: 5,
    background: '#1a1a1a', color: '#fff', fontSize: 12, cursor: 'pointer',
    border: 'none',
  },
  chatBtn: {
    width: '100%', padding: '6px 0', borderRadius: 6,
    background: '#f0f0ff', color: '#6366f1',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: '1px solid #e0e0ff',
  },
}
