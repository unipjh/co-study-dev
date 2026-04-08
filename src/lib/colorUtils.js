/**
 * 색상 관련 유틸리티
 * - annotation.color는 key string('yellow') 또는 hex('#FF5733') 모두 허용
 * - 기존 Firestore 데이터(key string) 하위 호환 유지
 */

export const PRESET_COLORS = [
  { key: 'yellow', hex: '#FFD700', label: '중요' },
  { key: 'blue',   hex: '#6BB5FF', label: '이해필요' },
  { key: 'green',  hex: '#5CCC7F', label: '암기' },
  { key: 'purple', hex: '#A855F7', label: 'AI 설명' },  // AI 전용, 팔레트 미노출
]

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** annotation.color → 하이라이트용 rgba (opacity 0.45) */
export function getHighlightColor(color) {
  const preset = PRESET_COLORS.find((c) => c.key === color || c.hex === color)
  if (preset) return hexToRgba(preset.hex, 0.45)
  if (typeof color === 'string' && color.startsWith('#')) return hexToRgba(color, 0.45)
  return hexToRgba('#FFD700', 0.45)
}

/** annotation.color → 표시용 hex (컬러 닷, 배너 등) */
export function getDisplayColor(color) {
  const preset = PRESET_COLORS.find((c) => c.key === color || c.hex === color)
  if (preset) return preset.hex
  if (typeof color === 'string' && color.startsWith('#')) return color
  return '#FFD700'
}

/** annotation.color → 라벨 문자열 */
export function getColorLabel(color) {
  const preset = PRESET_COLORS.find((c) => c.key === color || c.hex === color)
  return preset?.label ?? '사용자 색상'
}

const STORAGE_KEY = 'co-study-custom-colors'

/** localStorage에서 커스텀 색상 목록 로드 */
export function loadCustomColors() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** 커스텀 색상 추가 (최대 3개, 중복 제거 후 앞에 삽입) */
export function saveCustomColor(hex, current) {
  const next = [hex, ...current.filter((c) => c !== hex)].slice(0, 3)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

/** 커스텀 색상 삭제 */
export function removeCustomColor(hex, current) {
  const next = current.filter((c) => c !== hex)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
