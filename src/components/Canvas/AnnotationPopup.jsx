import { useEffect, useRef, useState } from 'react'
import {
  PRESET_COLORS,
  loadCustomColors,
  removeCustomColor,
  saveCustomColor,
  getDisplayColor,
  getColorLabel,
} from '../../lib/colorUtils'

const VISIBLE_PRESETS = PRESET_COLORS.filter((color) => color.key !== 'purple')

function normalizeHex(value) {
  const raw = String(value ?? '').trim()
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : null
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

export default function AnnotationPopup({
  annotation,
  displayPageIndex,
  containerSize,
  onUpdate,
  onDelete,
  onSendToChat,
  onClose,
}) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(annotation.content ?? '')
  const [selectedColor, setSelectedColor] = useState(annotation.color)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [customColors, setCustomColors] = useState(loadCustomColors)
  const [customPickerOpen, setCustomPickerOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState('#FF5733')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimerRef = useRef(null)
  const ref = useRef(null)

  useEffect(() => {
    setContent(annotation.content ?? '')
    setSelectedColor(annotation.color)
    setEditing(false)
    setDragOffset({ x: 0, y: 0 })
    setCustomPickerOpen(false)
    setConfirmDelete(false)
    clearTimeout(confirmTimerRef.current)
  }, [annotation.id, annotation.color, annotation.content])

  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const displayRects = (() => {
    if (displayPageIndex != null && annotation.rectGroups) {
      const group = annotation.rectGroups.find((rectGroup) => rectGroup.pageIndex === displayPageIndex)
      if (group?.rects?.length) return group.rects
    }
    return annotation.rects ?? []
  })()

  if (!containerSize || !displayRects.length) return null

  const colorChanged = selectedColor !== annotation.color
  const contentChanged = content !== (annotation.content ?? '')
  const hasDraftChanges = colorChanged || contentChanged
  const displayLabel = getColorLabel(selectedColor)

  const lastRect = displayRects[displayRects.length - 1]
  const popupWidth = 328
  const popupMinMargin = 4
  const popupEstimatedHeight = editing || hasDraftChanges || customPickerOpen ? 392 : 282
  let top = (lastRect.top + lastRect.height) * containerSize.height + 6 + dragOffset.y
  let left = displayRects[0].left * containerSize.width + dragOffset.x

  if (dragOffset.x === 0) {
    left = Math.max(
      popupMinMargin,
      Math.min(left, containerSize.width - popupWidth - popupMinMargin)
    )
  }
  if (dragOffset.y === 0) {
    top = Math.max(
      popupMinMargin,
      Math.min(top, Math.max(popupMinMargin, containerSize.height - popupEstimatedHeight))
    )
  }

  function startDrag(event) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const base = { ...dragOffset }

    function onMove(moveEvent) {
      setDragOffset({
        x: base.x + moveEvent.clientX - startX,
        y: base.y + moveEvent.clientY - startY,
      })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      clearTimeout(confirmTimerRef.current)
      onDelete?.(annotation.id)
      return
    }

    setConfirmDelete(true)
    confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
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
    if (selectedColor === hex) setSelectedColor(annotation.color)
  }

  function handleSave() {
    onUpdate?.(annotation.id, {
      content,
      color: selectedColor,
    })
    setEditing(false)
  }

  function handleCancelEdit() {
    setEditing(false)
    setContent(annotation.content ?? '')
    setSelectedColor(annotation.color)
    setCustomPickerOpen(false)
  }

  return (
    <div
      ref={ref}
      style={{ ...styles.popup, top, left, width: popupWidth }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div style={styles.dragHandle} onMouseDown={startDrag} title="드래그하여 이동" />

      <div style={styles.header}>
        {VISIBLE_PRESETS.map((color) => (
          <button
            key={color.key}
            type="button"
            title={color.label}
            aria-label={color.label}
            style={{
              ...styles.colorBtn,
              background: color.hex,
              ...(selectedColor === color.key || selectedColor === color.hex ? styles.colorBtnSelected : {}),
            }}
            onClick={() => {
              setSelectedColor(color.key)
              setCustomPickerOpen(false)
            }}
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
              onClick={() => {
                setSelectedColor(hex)
                setCustomPickerOpen(false)
              }}
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

        <span style={styles.colorLabel}>{displayLabel}</span>
        <div style={styles.spacer} />
        <button
          type="button"
          style={confirmDelete ? styles.deleteBtnConfirm : styles.deleteBtn}
          onClick={handleDeleteClick}
          title={confirmDelete ? '한 번 더 클릭하면 삭제됩니다' : '삭제'}
        >
          {confirmDelete ? '삭제?' : '×'}
        </button>
      </div>

      {customPickerOpen && (
        <CustomColorPicker
          draft={customDraft}
          onDraftChange={setCustomDraft}
          onApply={handleCustomApply}
          onCancel={() => setCustomPickerOpen(false)}
        />
      )}

      <p style={styles.sourceText}>"{annotation.text}"</p>

      {editing ? (
        <div style={styles.editArea}>
          <textarea
            autoFocus
            style={styles.textarea}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="메모를 입력하세요."
            rows={3}
          />
          <div style={styles.editActions}>
            <button type="button" style={styles.cancelBtn} onClick={handleCancelEdit}>취소</button>
            <button type="button" style={styles.saveBtn} onClick={handleSave}>저장</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          style={styles.memoArea}
          onClick={() => setEditing(true)}
          title="클릭해서 수정"
        >
          {content
            ? <span style={styles.memoText}>{content}</span>
            : <span style={styles.memoPlaceholder}>메모 추가...</span>}
        </button>
      )}

      {hasDraftChanges && !editing && (
        <div style={styles.draftActions}>
          <button type="button" style={styles.cancelBtn} onClick={handleCancelEdit}>취소</button>
          <button type="button" style={styles.saveBtn} onClick={handleSave}>저장</button>
        </div>
      )}

      <button type="button" style={styles.chatBtn} onClick={() => onSendToChat?.(annotation)}>
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
    border: '1px solid #d8d8ea',
    borderRadius: 6,
    boxShadow: '0 14px 30px rgba(7,7,97,0.14)',
    padding: '14px 14px 11px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  dragHandle: {
    height: 8,
    cursor: 'grab',
    margin: '-8px 0 0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'nowrap',
    minHeight: 28,
  },
  colorBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    flexShrink: 0,
    cursor: 'pointer',
    border: '1.5px solid #8585b0',
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
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#aaa',
    color: '#fff',
    fontSize: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
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
    fontSize: 12,
    color: '#999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    padding: 0,
  },
  colorLabel: {
    fontSize: 14,
    color: '#333333',
    fontWeight: 800,
    marginLeft: 2,
    flexShrink: 0,
  },
  spacer: { flex: 1 },
  deleteBtn: {
    fontSize: 18,
    color: '#777790',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
  },
  deleteBtnConfirm: {
    fontSize: 11,
    color: '#ef4444',
    cursor: 'pointer',
    fontWeight: 800,
    padding: '3px 6px',
    lineHeight: 1,
    flexShrink: 0,
    background: '#fff0f0',
    border: '1px solid #fca5a5',
    borderRadius: 4,
  },
  customPicker: {
    display: 'grid',
    gridTemplateColumns: '28px 92px auto 24px',
    alignItems: 'center',
    gap: 8,
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
  sourceText: {
    margin: 0,
    fontSize: 15,
    color: '#9a9aa8',
    lineHeight: '20px',
    borderLeft: '2px solid #cfcfcf',
    paddingLeft: 14,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  memoArea: {
    minHeight: 34,
    cursor: 'text',
    border: 'none',
    background: 'transparent',
    padding: 0,
    textAlign: 'left',
  },
  memoText: {
    display: 'block',
    fontSize: 15,
    color: '#111111',
    lineHeight: '20px',
    wordBreak: 'break-word',
    fontWeight: 650,
  },
  memoPlaceholder: {
    display: 'block',
    fontSize: 16,
    color: '#111111',
    fontWeight: 900,
  },
  editArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  textarea: {
    resize: 'vertical',
    border: '1px solid #cfcfe3',
    borderRadius: 5,
    padding: '13px 14px',
    fontSize: 15,
    fontFamily: 'inherit',
    outline: 'none',
    minHeight: 126,
    lineHeight: '20px',
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
  },
  draftActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
  },
  cancelBtn: {
    padding: '8px 12px',
    borderRadius: 5,
    background: '#f1f1fb',
    color: '#070761',
    fontSize: 12,
    cursor: 'pointer',
    border: 'none',
    fontWeight: 800,
  },
  saveBtn: {
    padding: '8px 14px',
    borderRadius: 5,
    background: '#070761',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    border: 'none',
    fontWeight: 900,
  },
  chatBtn: {
    width: '100%',
    padding: '9px 0',
    borderRadius: 5,
    background: '#efeffa',
    color: '#070761',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    border: '1px solid #cfcfe3',
  },
}
