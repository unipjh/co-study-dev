import { useEffect, useRef, useState } from 'react'
import {
  loadCustomColors,
  removeCustomColor,
  saveCustomColor,
  getDisplayColor,
  getColorLabel,
} from '../../lib/colorUtils'

const PRESET_COLORS = [
  { key: 'purple', label: '중요 표시', bg: '#070761' },
  { key: 'blue', label: '정리 필요', bg: '#E9EDFF' },
  { key: 'green', label: '이해됨', bg: '#D9FFF1' },
  { key: 'mint', label: '다시 보기', bg: '#41FFA7' },
]

function normalizeHex(value) {
  const raw = String(value ?? '').trim()
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : null
}

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.25a8.75 8.75 0 1 0 0 17.5 8.75 8.75 0 0 0 0-17.5Zm0 15.25a1.05 1.05 0 1 1 0-2.1 1.05 1.05 0 0 1 0 2.1Zm.12-4.05c-.57 0-.94-.35-.94-.9 0-1.96 2.08-2.24 2.08-3.58 0-.69-.48-1.14-1.25-1.14-.79 0-1.31.43-1.52 1.26-.14.5-.49.74-.96.74-.6 0-1.01-.41-.9-1.05.24-1.55 1.55-2.74 3.45-2.74 2.01 0 3.4 1.17 3.4 2.92 0 2.22-2.29 2.55-2.43 3.73-.07.5-.4.76-.93.76Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CustomColorPicker({ draft, onDraftChange, onApply, onCancel }) {
  const normalized = normalizeHex(draft)

  return (
    <div style={styles.customPicker}>
      <input
        type="color"
        value={normalized ?? '#FF5733'}
        onChange={(event) => onDraftChange(event.target.value.toUpperCase())}
        style={styles.colorInput}
        aria-label="색상 선택"
      />
      <input
        type="text"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        style={{
          ...styles.hexInput,
          ...(draft && !normalized ? styles.hexInputInvalid : {}),
        }}
        placeholder="#FF5733"
        aria-label="색상 코드"
      />
      <button
        type="button"
        style={{ ...styles.applyColorBtn, opacity: normalized ? 1 : 0.45 }}
        onClick={() => normalized && onApply(normalized)}
        disabled={!normalized}
      >
        색상 지정
      </button>
      <button type="button" style={styles.cancelColorBtn} onClick={onCancel} aria-label="색상 지정 취소">
        ×
      </button>
    </div>
  )
}

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
  onSendSelectionToChat,
}) {
  const [phase, setPhase] = useState('color')
  const [selectedColor, setSelectedColor] = useState(null)
  const [memoText, setMemoText] = useState('')
  const [customColors, setCustomColors] = useState(loadCustomColors)
  const [customPickerOpen, setCustomPickerOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState('#FF5733')
  const [dragPos, setDragPos] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  if (!viewportRect) return null

  const selectedBg = selectedColor ? getDisplayColor(selectedColor) : null
  const memoBoxHeight = 252
  const colorBarHeight =
    (pendingCount > 0 ? 94 + pendingCount * 28 : 58) +
    (customPickerOpen ? 58 : 0) +
    (selectedColor ? 42 : 0)
  const flipDown = viewportRect.top < (phase === 'memo' ? memoBoxHeight : colorBarHeight) + 8
  const computedTop = flipDown
    ? viewportRect.bottom + 8
    : viewportRect.top - (phase === 'memo' ? memoBoxHeight : colorBarHeight) - 8
  const estimatedWidth = phase === 'memo' ? 320 : 360
  const computedLeft = Math.min(
    window.innerWidth - estimatedWidth / 2 - 12,
    Math.max(estimatedWidth / 2 + 12, viewportRect.left + viewportRect.width / 2)
  )

  const top = dragPos ? dragPos.top : computedTop
  const left = dragPos ? dragPos.left : computedLeft
  const transform = dragPos ? 'none' : 'translateX(-50%)'

  function startDrag(event) {
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const initLeft = dragPos ? dragPos.left : computedLeft - (ref.current?.offsetWidth ?? 0) / 2
    const initTop = dragPos ? dragPos.top : computedTop

    function onMove(moveEvent) {
      setDragPos({
        top: initTop + moveEvent.clientY - startY,
        left: initLeft + moveEvent.clientX - startX,
      })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleCustomApply(hex) {
    const next = saveCustomColor(hex, customColors)
    setCustomColors(next)
    setSelectedColor(hex)
    setCustomPickerOpen(false)
    setCustomDraft(hex)
  }

  function handleRemoveCustom(event, hex) {
    event.stopPropagation()
    const next = removeCustomColor(hex, customColors)
    setCustomColors(next)
    if (selectedColor === hex) setSelectedColor(null)
  }

  function handleQuickSave() {
    if (!selectedColor) return
    onSave?.(selectedColor, '')
  }

  function handleMemoSave() {
    if (!selectedColor) return
    onSave?.(selectedColor, memoText.trim())
  }

  function handleSendToChatOnly() {
    if (isRegion) onSendImageToChat?.()
    else onSendSelectionToChat?.()
    onClose()
  }

  return (
    <div
      ref={ref}
      style={{ ...styles.container, top, left, transform }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div style={styles.dragHandle} onMouseDown={startDrag} title="드래그하여 이동" />

      {phase === 'color' ? (
        <div style={styles.colorPhase}>
          {pendingCount > 0 && (
            <div style={styles.pendingSection}>
              <div style={styles.pendingHeader}>
                <span style={styles.pendingBadge}>{pendingCount}개 누적</span>
                <button type="button" style={styles.pendingClear} onClick={() => { onClearPending?.(); onClose() }}>
                  모두 지우기
                </button>
              </div>
              {pendingGroups.map((group, index) => (
                <div key={`${group.text}_${index}`} style={styles.pendingItem}>
                  <span style={styles.pendingItemText} title={group.text}>
                    {index + 1}. {group.text.length > 22 ? `${group.text.slice(0, 22)}...` : group.text}
                  </span>
                  <button
                    type="button"
                    style={styles.pendingItemRemove}
                    onClick={() => onRemovePending?.(index)}
                    title="이 항목 제거"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={styles.colorRow}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color.key}
                type="button"
                title={color.label}
                aria-label={color.label}
                style={{
                  ...styles.colorBtn,
                  background: color.bg,
                  ...(selectedColor === color.key ? styles.colorBtnSelected : {}),
                }}
                onClick={() => setSelectedColor(color.key)}
              />
            ))}

            {customColors.map((hex) => (
              <div key={hex} style={styles.customBtnWrap}>
                <button
                  type="button"
                  title={hex}
                  aria-label={hex}
                  style={{
                    ...styles.colorBtn,
                    background: hex,
                    ...(selectedColor === hex ? styles.colorBtnSelected : {}),
                  }}
                  onClick={() => setSelectedColor(hex)}
                />
                <button
                  type="button"
                  style={styles.removeBtn}
                  onClick={(event) => handleRemoveCustom(event, hex)}
                  title="색상 제거"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              title="색상 추가"
              style={styles.addBtn}
              onClick={() => {
                setCustomDraft(selectedColor?.startsWith?.('#') ? selectedColor : '#FF5733')
                setCustomPickerOpen((value) => !value)
              }}
            >
              +
            </button>

            <span style={styles.divider} />

            <button
              type="button"
              title={isRegion ? '이미지를 Chat으로 보내기' : '선택 텍스트를 저장하지 않고 Chat 맥락에 추가'}
              style={isRegion ? styles.imgChatBtn : styles.chatContextBtn}
              onClick={handleSendToChatOnly}
            >
              Chat
            </button>

            <button
              type="button"
              title="AI 즉시 설명"
              aria-label="AI 즉시 설명"
              style={styles.aiIconBtn}
              onClick={() => { onAITutor?.(); onClose() }}
            >
              <HelpIcon />
            </button>

            {!isRegion && (
              <button
                type="button"
                title="현재 선택을 유지하고 다음 선택 추가"
                style={styles.addSelBtn}
                onClick={() => onAddSelection?.()}
              >
                + 선택
              </button>
            )}
          </div>

          {customPickerOpen && (
            <CustomColorPicker
              draft={customDraft}
              onDraftChange={setCustomDraft}
              onApply={handleCustomApply}
              onCancel={() => setCustomPickerOpen(false)}
            />
          )}

          {selectedColor && (
            <div style={styles.colorActions}>
              <button type="button" style={styles.memoBtn} onClick={() => setPhase('memo')}>
                메모 쓰기
              </button>
              <button type="button" style={styles.colorSaveBtn} onClick={handleQuickSave}>
                저장
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={styles.memoBox}>
          <div style={styles.memoHeader}>
            <span style={{ ...styles.colorDot, background: selectedBg }} />
            <span style={styles.memoLabel}>
              {pendingCount > 0 ? `${pendingCount + 1}개 선택 · ` : ''}{getColorLabel(selectedColor)}
            </span>
          </div>
          <textarea
            autoFocus
            style={styles.textarea}
            value={memoText}
            onChange={(event) => setMemoText(event.target.value)}
            placeholder="메모를 입력하세요."
            rows={3}
          />
          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={() => { onClearPending?.(); onClose() }}>
              취소
            </button>
            <button type="button" style={styles.sendChatBtn} onClick={handleSendToChatOnly}>
              Chat으로 보내기
            </button>
            <button type="button" style={styles.saveBtn} onClick={handleMemoSave}>
              저장
            </button>
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
    background: '#ffffff',
    border: '1px solid #d8d8ea',
    borderRadius: 8,
    boxShadow: '0 14px 30px rgba(7,7,97,0.14)',
    color: '#111111',
  },
  dragHandle: {
    height: 8,
    cursor: 'grab',
  },
  colorPhase: {
    display: 'flex',
    flexDirection: 'column',
  },
  pendingSection: {
    borderBottom: '1px solid #ededf6',
    padding: '6px 12px',
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
    color: '#070761',
    fontWeight: 800,
  },
  pendingClear: {
    fontSize: 10,
    color: '#777790',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    padding: 0,
  },
  pendingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#f4f4fb',
    borderRadius: 4,
    padding: '3px 6px',
  },
  pendingItemText: {
    fontSize: 11,
    color: '#71718a',
    flex: 1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  pendingItemRemove: {
    fontSize: 13,
    color: '#777',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    flexShrink: 0,
    padding: '0 2px',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '13px 16px',
    flexWrap: 'nowrap',
  },
  colorBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '1.4px solid #8585b0',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  colorBtnSelected: {
    outline: '2px solid #070761',
    outlineOffset: 2,
    boxShadow: '0 0 0 4px rgba(65,255,167,0.24)',
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
    border: '1px solid #333',
    padding: 0,
    lineHeight: 1,
  },
  addBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '1.5px dashed #d4d4df',
    cursor: 'pointer',
    flexShrink: 0,
    fontSize: 14,
    color: '#b5b5c4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    padding: 0,
  },
  divider: {
    width: 1,
    height: 18,
    background: '#e1e1ee',
    flexShrink: 0,
  },
  chatContextBtn: {
    fontSize: 11,
    cursor: 'pointer',
    padding: '5px 10px',
    background: '#fff7dc',
    border: '1px solid transparent',
    color: '#8b6800',
    borderRadius: 5,
    flexShrink: 0,
    fontWeight: 900,
  },
  imgChatBtn: {
    fontSize: 11,
    cursor: 'pointer',
    padding: '5px 10px',
    background: '#fff7dc',
    border: '1px solid transparent',
    color: '#8b6800',
    borderRadius: 5,
    flexShrink: 0,
    fontWeight: 900,
  },
  aiIconBtn: {
    width: 36,
    height: 28,
    borderRadius: 5,
    border: '1px solid #d8d8ef',
    background: '#f1f1ff',
    color: '#070761',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  addSelBtn: {
    fontSize: 11,
    cursor: 'pointer',
    padding: '5px 10px',
    background: '#f2f2fb',
    border: '1px solid #dfdff0',
    color: '#070761',
    borderRadius: 5,
    flexShrink: 0,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  customPicker: {
    display: 'grid',
    gridTemplateColumns: '28px 92px auto 24px',
    alignItems: 'center',
    gap: 8,
    margin: '0 16px 12px',
    padding: '9px 10px',
    borderRadius: 7,
    background: '#f7f7fb',
    border: '1px solid #dedeee',
  },
  colorInput: {
    width: 28,
    height: 28,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
  hexInput: {
    width: 92,
    height: 28,
    border: '1px solid #cfcfe3',
    borderRadius: 5,
    padding: '0 8px',
    color: '#111111',
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
  },
  hexInputInvalid: {
    borderColor: '#c01048',
    background: '#fff1f3',
  },
  applyColorBtn: {
    height: 28,
    padding: '0 10px',
    border: 'none',
    borderRadius: 5,
    background: '#070761',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  cancelColorBtn: {
    width: 24,
    height: 24,
    border: 'none',
    borderRadius: 5,
    background: 'transparent',
    color: '#777790',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
    padding: 0,
    lineHeight: '24px',
  },
  colorActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '0 16px 13px',
  },
  memoBtn: {
    height: 28,
    padding: '0 12px',
    borderRadius: 5,
    background: '#eeeef8',
    color: '#070761',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    border: 'none',
  },
  colorSaveBtn: {
    height: 28,
    padding: '0 14px',
    borderRadius: 5,
    background: '#070761',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    border: 'none',
  },
  memoBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 14,
    width: 320,
  },
  memoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    flexShrink: 0,
    border: '2px solid #070761',
    boxShadow: '0 0 0 2px #e8e8f2',
  },
  memoLabel: {
    fontSize: 14,
    color: '#333333',
    fontWeight: 800,
  },
  textarea: {
    resize: 'none',
    border: '1px solid #cfcfe3',
    borderRadius: 5,
    padding: '13px 14px',
    fontSize: 15,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#ffffff',
    color: '#111111',
    lineHeight: '20px',
    minHeight: 126,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
  },
  cancelBtn: {
    padding: '7px 10px',
    borderRadius: 5,
    background: '#f1f1fb',
    color: '#070761',
    fontSize: 12,
    cursor: 'pointer',
    border: 'none',
    fontWeight: 800,
  },
  sendChatBtn: {
    padding: '7px 10px',
    borderRadius: 5,
    background: '#efeffa',
    color: '#070761',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    border: 'none',
  },
  saveBtn: {
    padding: '7px 13px',
    borderRadius: 5,
    background: '#070761',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    border: 'none',
  },
}
