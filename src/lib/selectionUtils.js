/**
 * 같은 줄에 있는 rect들을 하나로 병합한다.
 * react-pdf 텍스트 레이어는 단어마다 별도 span → clientRects가 단어 단위로 분절.
 * 수직 겹침이 50% 이상이면 같은 줄로 간주하고 좌우로 확장한다.
 *
 * @param {Array<{top, left, width, height}>} rects  비율 또는 픽셀 좌표 모두 가능
 * @returns {Array<{top, left, width, height}>}
 */
export function mergeLineRects(rects) {
  if (!rects || rects.length === 0) return rects

  const sorted = [...rects].sort((a, b) =>
    a.top !== b.top ? a.top - b.top : a.left - b.left
  )

  const merged = []
  let cur = { ...sorted[0] }

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]
    const curBottom = cur.top + cur.height
    const rBottom   = r.top  + r.height
    const overlap   = Math.min(curBottom, rBottom) - Math.max(cur.top, r.top)

    // 수직 겹침이 두 rect 중 작은 쪽 높이의 50% 이상 → 같은 줄
    if (overlap >= Math.min(cur.height, r.height) * 0.5) {
      const newLeft   = Math.min(cur.left, r.left)
      const newRight  = Math.max(cur.left + cur.width, r.left + r.width)
      const newTop    = Math.min(cur.top, r.top)
      const newBottom = Math.max(curBottom, rBottom)
      cur = { left: newLeft, top: newTop, width: newRight - newLeft, height: newBottom - newTop }
    } else {
      merged.push(cur)
      cur = { ...r }
    }
  }
  merged.push(cur)
  return merged
}

/**
 * 현재 window.getSelection()에서 선택 정보를 추출한다.
 * rects[] — 텍스트 줄 단위 복수 rect (비율 기준).
 * 이미지·공백 영역은 포함되지 않는다.
 *
 * @param {HTMLElement} pageContainer
 * @param {number} pageIndex  0-based
 * @returns {SelectionInfo | null}
 */
export function extractSelection(pageContainer, pageIndex) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return null

  const text = selection.toString().trim()
  const range = selection.getRangeAt(0)

  if (!pageContainer.contains(range.commonAncestorContainer)) return null

  const containerRect = pageContainer.getBoundingClientRect()

  // 텍스트 줄 단위 rect (width/height > 1px 인 것만)
  const clientRects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 1 && r.height > 1
  )

  // 비율 기반 rects 배열 — 같은 줄 rect 병합 후 저장
  const rects = mergeLineRects(
    clientRects.map((r) => ({
      top:    (r.top    - containerRect.top)    / containerRect.height,
      left:   (r.left   - containerRect.left)   / containerRect.width,
      width:  r.width  / containerRect.width,
      height: r.height / containerRect.height,
    }))
  )

  // 전체 바운딩 박스 — 팝업 위치 계산에 사용
  const domRect = clientRects.length > 0
    ? {
        top:    Math.min(...clientRects.map((r) => r.top)),
        left:   Math.min(...clientRects.map((r) => r.left)),
        bottom: Math.max(...clientRects.map((r) => r.bottom)),
        right:  Math.max(...clientRects.map((r) => r.right)),
        get width()  { return this.right - this.left },
        get height() { return this.bottom - this.top },
      }
    : range.getBoundingClientRect()

  // span 내 문자 오프셋 (겹침 감지용)
  const startOffset = range.startOffset
  const endOffset   = range.endOffset

  const textLayer = pageContainer.querySelector('.react-pdf__Page__textContent')
  let spanIndex = -1
  if (textLayer && range.startContainer.parentElement) {
    const spans = Array.from(textLayer.querySelectorAll('span'))
    spanIndex = spans.indexOf(range.startContainer.parentElement)
  }

  return {
    text,
    pageIndex,
    startOffset,
    endOffset,
    spanIndex,
    rects,
    // 뷰포트 기준 바운딩 박스 — SelectionToolbar 위치 계산용
    viewportRect: {
      top:    domRect.top,
      left:   domRect.left,
      bottom: domRect.bottom,
      right:  domRect.right,
      width:  domRect.width,
      height: domRect.height,
    },
  }
}

/**
 * 두 annotation이 동일 span에서 오프셋이 겹치는지 확인
 */
export function isOverlapping(a, b) {
  if (a.pageIndex !== b.pageIndex) return false
  if (a.spanIndex !== b.spanIndex) return false
  return a.startOffset < b.endOffset && b.startOffset < a.endOffset
}

/**
 * 고유 ID 생성
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}
