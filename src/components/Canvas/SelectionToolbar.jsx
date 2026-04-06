import { useState, useEffect, useRef } from 'react'

const COLORS = [
  { key: 'yellow', label: '중요',    bg: '#FFD700' },
  { key: 'blue',   label: '이해필요', bg: '#6BB5FF' },
  { key: 'green',  label: '암기',    bg: '#5CCC7F' },
]

/**
 * 텍스트 선택 시 떠오르는 팝업
 * phase 1 — 색상 선택
 * phase 2 — 메모 입력 (공란 허용)
 *
 * @param {{ viewportRect, onSave, onClose }} props
 *   onSave(color, memoText) — 저장 콜백
 */
export default function SelectionToolbar({ viewportRect, onSave, onClose }) {
  const [phase, setPhase] = useState('color')      // 'color' | 'memo'
  const [selectedColor, setSelectedColor] = useState(null)
  const [memoText, setMemoText] = useState('')
  const ref = useRef(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  if (!viewportRect) return null

  const colorInfo = COLORS.find((c) => c.key === selectedColor)

  // 팝업 위치: 선택 영역 위. 화면 상단에 붙으면 아래로 플립
  const memoBoxHeight = 140
  const colorBarHeight = 44
  const flipDown = viewportRect.top < (phase === 'memo' ? memoBoxHeight : colorBarHeight) + 8
  const top = flipDown
    ? viewportRect.bottom + 8
    : viewportRect.top - (phase === 'memo' ? memoBoxHeight : colorBarHeight) - 8
  const left = viewportRect.left + viewportRect.width / 2

  function handleColorSelect(key) {
    setSelectedColor(key)
    setPhase('memo')
  }

  function handleSave() {
    if (!selectedColor) return
    onSave?.(selectedColor, memoText.trim())
  }

  return (
    <div
      ref={ref}
      style={{ ...styles.container, top, left, transform: 'translateX(-50%)' }}
      // 클릭이 selection을 해제하지 않도록
      onPointerDown={(e) => e.preventDefault()}
    >
      {phase === 'color' ? (
        <div style={styles.colorRow}>
          {COLORS.map((c) => (
            <button
              key={c.key}
              title={c.label}
              style={{ ...styles.colorBtn, background: c.bg }}
              onClick={() => handleColorSelect(c.key)}
            />
          ))}
        </div>
      ) : (
        <div style={styles.memoBox}>
          <div style={styles.memoHeader}>
            <span style={{ ...styles.colorDot, background: colorInfo?.bg }} />
            <span style={styles.memoLabel}>{colorInfo?.label}</span>
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
            <button style={styles.cancelBtn} onClick={onClose}>취소</button>
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
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
  },
  colorBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.35)',
    cursor: 'pointer',
    flexShrink: 0,
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
