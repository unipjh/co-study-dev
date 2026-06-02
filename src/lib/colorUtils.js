/**
 * Annotation color helpers.
 * annotation.color accepts preset keys such as "yellow" or custom hex values.
 */

export const PRESET_COLORS = [
  { key: 'yellow', hex: '#FFD700', label: '중요 표시' },
  { key: 'blue', hex: '#E9EDFF', label: '정리 필요' },
  { key: 'green', hex: '#D9FFF1', label: '이해됨' },
  { key: 'mint', hex: '#41FFA7', label: '다시 보기' },
  { key: 'purple', hex: '#070761', label: '중요 표시' },
]

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getHighlightColor(color) {
  const preset = PRESET_COLORS.find((item) => item.key === color || item.hex === color)
  if (preset) return hexToRgba(preset.hex, 0.45)
  if (typeof color === 'string' && color.startsWith('#')) return hexToRgba(color, 0.45)
  return hexToRgba('#FFD700', 0.45)
}

export function getDisplayColor(color) {
  const preset = PRESET_COLORS.find((item) => item.key === color || item.hex === color)
  if (preset) return preset.hex
  if (typeof color === 'string' && color.startsWith('#')) return color
  return '#FFD700'
}

export function getColorLabel(color) {
  const preset = PRESET_COLORS.find((item) => item.key === color || item.hex === color)
  return preset?.label ?? '사용자 색상'
}

const STORAGE_KEY = 'co-study-custom-colors'

export function loadCustomColors() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveCustomColor(hex, current) {
  const next = [hex, ...current.filter((item) => item !== hex)].slice(0, 3)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function removeCustomColor(hex, current) {
  const next = current.filter((item) => item !== hex)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
