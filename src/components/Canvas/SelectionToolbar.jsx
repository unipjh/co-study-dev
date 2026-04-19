import { useState, useEffect, useRef } from 'react'
import { loadCustomColors, saveCustomColor, removeCustomColor, getDisplayColor } from '../../lib/colorUtils'

const PRESET_COLORS = [
  { key: 'yellow', label: '중요',    bg: '#FFD700' },
  { key: 'blue',   label: '이해필요', bg: '#6BB5FF' },
  { key: 'green',  label: '암기',    bg: '#5CCC7F' },
]

/**
 * 텍스트 선택 시 떠오르는 팝업
 * phase 'color' — 색상 선택 (프리셋 + 커스텀) + AI ⚡ + 추가선택
 * phase 'memo'  — 메모 입력 (공란 허용)
 *
 * @param {{ viewportRect, onSave, onClose, onAITutor, pendingGroups, pendingCount, onAddSelection, onClearPending, onRemovePending, isRegion, onSendImageToChat }} props
 */
export default function SelectionToolbar({
  viewportRect,
  onSave,
  onClose,
  onAITutor,
  pendingGroups = [],
  pendingCount = 0,
  onAddSelection,
  onClearPending,
  onRemovePending,
  isRegion = false,
  onSendImageToChat,
}) {
  const [phase, setPhase]             = useState('color')
  const [selectedColor, setSelectedColor] = useState(null)  // key string 또는 hex
  const [memoText, setMemoText]       = useState('')
  const [customColors, setCustomColors] = useState(loadCustomColors)
  const [stagedColor, setStagedColor] = useState(null)  // 커스텀 색상 확인 대기 중
  const [dragPos, setDragPos]         = useState(null)  // {top, left} — 드래그 후 고정 위치
  const ref       = useRef(null)
  const inputRef  = useRef(null)  // <input type="color">

  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        // 외부 클릭: toolbar만 닫기, pendingGroups는 보존
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  if (!viewportRect) return null

  const selectedBg = selectedColor
    ? getDisplayColor(selectedColor)
    : null

  const memoBoxHeight  = 140
  const colorBarHeight = pendingCount > 0 ? 80 + pendingCount * 26 : 50
  const flipDown = viewportRect.top < (phase === 'memo' ? memoBoxHeight : colorBarHeight) + 8
  const computedTop  = flipDown
    ? viewportRect.bottom + 8
    : viewportRect.top - (phase === 'memo' ? memoBoxHeight : colorBarHeight) - 8
  const computedLeft = viewportRect.left + viewportRect.width / 2

  const top  = dragPos ? dragPos.top  : computedTop
  const left = dragPos ? dragPos.left : computedLeft
  const transform = dragPos ? 'none' : 'translateX(-50%)'

  function startDrag(e) {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const initLeft = dragPos
      ? dragPos.left
      : computedLeft - (ref.current?.offsetWidth ?? 0) / 2
    const initTop  = dragPos ? dragPos.top : computedTop

    function onMove(ev) {
      setDragPos({
        top:  initTop  + ev.clientY - startY,
        left: initLeft + ev.clientX - startX,
      })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startTouchDrag(e) {
    if (e.touches.length !== 1) return
    const touch  = e.touches[0]
    const startX = touch.clientX
    const startY = touch.clientY
    const initLeft = dragPos
      ? dragPos.left
      : computedLeft - (ref.current?.offsetWidth ?? 0) / 2
    const initTop  = dragPos ? dragPos.top : computedTop

    function onMove(ev) {
      ev.preventDefault()
      const t = ev.touches[0]
      setDragPos({
        top:  initTop  + t.clientY - startY,
        left: initLeft + t.clientX - startX,
      })
    }
    function onUp() {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onUp)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onUp)
  }

  function handleColorSelect(colorValue) {
    setSelectedColor(colorValue)
    setPhase('memo')
  }

  function handleCustomColorChange(e) {
    setStagedColor(e.target.value)
  }

  function handleConfirmCustomColor() {
    if (!stagedColor) return
    const next = saveCustomColor(stagedColor, customColors)
    setCustomColors(next)
    handleColorSelect(stagedColor)
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

  function handleSave() {
    if (!selectedColor) return
    onSave?.(selectedColor, memoText.trim())
  }

  function handleAddSelection() {
    onAddSelection?.()
    // toolbar는 DocumentCanvas에서 selection 클리어로 자연히 닫힘
  }

  return (
    <div
      ref={ref}
      style={{ ...styles.container, top, left, transform }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* 드래그 핸들 */}
      <div style={styles.dragHandle} onMouseDown={startDrag} onTouchStart={startTouchDrag} title="드래그하여 이동">⠿</div>

      {phase === 'color' ? (
        <div style={styles.colorPhase}>
          {/* 누적 선택 목록 (개별 제거 가능) */}
          {pendingCount > 0 && (
            <div style={styles.pendingSection}>
              <div style={styles.pendingHeader}>
                <span style={styles.pendingBadge}>{pendingCount}개 누적됨</span>
                <button style={styles.pendingClear} onClick={() => { onClearPending?.(); onClose() }} title="전체 초기화">모두 지우기</button>
              </div>
              {pendingGroups.map((g, i) => (
                <div key={i} style={styles.pendingItem}>
                  <span style={styles.pendingItemText} title={g.text}>
                    {i + 1}. {g.text.length > 22 ? g.text.slice(0, 22) + '…' : g.text}
                  </span>
                  <button
                    style={styles.pendingItemRemove}
                    onClick={() => onRemovePending?.(i)}
                    title="이 항목 제거"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 색상 버튼 행 */}
          <div style={styles.colorRow}>
            {/* 프리셋 */}
            {PRESET_COLORS.map((c) => (
              <button
                key={c.key}
                title={c.label}
                style={{ ...styles.colorBtn, background: c.bg }}
                onClick={() => handleColorSelect(c.key)}
              />
            ))}

            {/* 커스텀 색상 */}
            {customColors.map((hex) => (
              <div key={hex} style={styles.customBtnWrap}>
                <button
                  title={hex}
                  style={{ ...styles.colorBtn, background: hex }}
                  onClick={() => handleColorSelect(hex)}
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

            {/* + 커스텀 색 추가 */}
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

            {/* 커스텀 색상 스테이징 확인 UI */}
            {stagedColor && (
              <>
                <div
                  style={{ ...styles.colorBtn, background: stagedColor, border: '2px solid rgba(255,255,255,0.7)', cursor: 'default' }}
                  title={`선택 중: ${stagedColor}`}
                  onClick={() => inputRef.current?.click()}
                />
                <button style={styles.confirmBtn} onClick={handleConfirmCustomColor} title="이 색상으로 확정">✓</button>
                <button style={styles.cancelCustomBtn} onClick={handleCancelCustomColor} title="취소">✗</button>
              </>
            )}

            <span style={styles.divider} />

            {/* AI 즉시 설명 */}
            <button
              title="AI 즉시 설명"
              style={styles.aiBtn}
              onClick={() => { onAITutor?.(); onClose() }}
            >
              💡
            </button>

            {/* 영역 이미지 → Chat */}
            {isRegion && onSendImageToChat && (
              <button
                title="이미지로 Chat 전송"
                style={styles.imgChatBtn}
                onClick={() => { onSendImageToChat?.() }}
              >
                📷
              </button>
            )}

            {/* 추가 선택 */}
            {!isRegion && (
              <button
                title="현재 선택을 유지하고 더 선택"
                style={styles.addSelBtn}
                onClick={handleAddSelection}
              >
                +선택
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={styles.memoBox}>
          <div style={styles.memoHeader}>
            <span style={{ ...styles.colorDot, background: selectedBg }} />
            <span style={styles.memoLabel}>
              {pendingCount > 0 ? `${pendingCount + 1}개 선택 · ` : ''}메모 입력
            </span>
          </div>
          <textarea
            autoFocus
            style={styles.textarea}
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            placeholder="메모 내용 (선택사항)"
            rows={3}
          />
          <div style={styles.actions}>
            <button style={styles.cancelBtn} onClick={() => { onClearPending?.(); onClose() }}>취소</button>
            <button style={styles.saveBtn} onClick={handleSave}>저장</button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    zIndex: 1000,
    background: '#1a1a1a',
    borderRadius: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  dragHandle: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    cursor: 'grab',
    userSelect: 'none',
    padding: '4px 0 2px',
    lineHeight: 1,
  },
  colorPhase: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  pendingSection: {
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    padding: '6px 12px 6px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  pendingHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  pendingBadge: {
    fontSize: 10,
    color: '#a78bfa',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  pendingClear: {
    fontSize: 10,
    color: '#888',
    cursor: 'pointer',
    lineHeight: 1,
    background: 'transparent',
    border: 'none',
  },
  pendingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 4,
    padding: '3px 6px',
  },
  pendingItemText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    flex: 1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  pendingItemRemove: {
    fontSize: 13,
    color: '#777',
    cursor: 'pointer',
    lineHeight: 1,
    background: 'transparent',
    border: 'none',
    flexShrink: 0,
    padding: '0 2px',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    flexWrap: 'nowrap',
  },
  colorBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.35)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  customBtnWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  removeBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 13,
    height: 13,
    borderRadius: '50%',
    background: '#555',
    color: '#fff',
    fontSize: 9,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    border: '1px solid #333',
  },
  addBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '2px dashed rgba(255,255,255,0.35)',
    cursor: 'pointer',
    flexShrink: 0,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    background: 'transparent',
  },
  hiddenInput: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  confirmBtn: {
    fontSize: 13,
    color: '#5CCC7F',
    cursor: 'pointer',
    padding: '0 2px',
    background: 'transparent',
    border: 'none',
    lineHeight: 1,
    fontWeight: 700,
    flexShrink: 0,
  },
  cancelCustomBtn: {
    fontSize: 13,
    color: '#ff6b6b',
    cursor: 'pointer',
    padding: '0 2px',
    background: 'transparent',
    border: 'none',
    lineHeight: 1,
    fontWeight: 700,
    flexShrink: 0,
  },
  divider: {
    width: 1,
    height: 18,
    background: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
  },
  aiBtn: {
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    background: 'transparent',
    border: 'none',
    color: '#fff',
    flexShrink: 0,
  },
  imgChatBtn: {
    fontSize: 15,
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    background: 'transparent',
    border: 'none',
    color: '#fff',
    flexShrink: 0,
  },
  addSelBtn: {
    fontSize: 11,
    cursor: 'pointer',
    padding: '3px 7px',
    lineHeight: 1,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'rgba(255,255,255,0.8)',
    borderRadius: 5,
    flexShrink: 0,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  memoBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    width: 220,
  },
  memoHeader: { display: 'flex', alignItems: 'center', gap: 6 },
  colorDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  memoLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 600 },
  textarea: {
    resize: 'none',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 6 },
  cancelBtn: {
    padding: '4px 10px',
    borderRadius: 5,
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '4px 12px',
    borderRadius: 5,
    background: '#fff',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
}
