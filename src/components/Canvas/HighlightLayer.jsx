import { getHighlightColor } from '../../lib/colorUtils'

/**
 * PDF 페이지 위에 annotation 하이라이트를 텍스트 줄 단위로 오버레이.
 * - annotation.color: key string('yellow') 또는 hex('#FF5733') 모두 지원
 * - rectGroups 있으면 멀티 드래그 그룹별 렌더링, 없으면 기존 rects 사용
 *
 * @param {{ annotations, pageIndex, containerSize, onClickAnnotation }} props
 */
export default function HighlightLayer({ annotations, pageIndex, containerSize, onClickAnnotation }) {
  if (!containerSize) return null

  // 이 페이지에 해당하는 rect 목록을 annotation별로 수집
  const renderItems = []

  for (const ann of annotations) {
    if (ann.rectGroups) {
      // 멀티 드래그: 이 페이지에 해당하는 그룹만
      for (const group of ann.rectGroups) {
        if (group.pageIndex === pageIndex) {
          renderItems.push({ ann, rects: group.rects })
        }
      }
    } else {
      // 단일 드래그 (기존 호환)
      if (ann.pageIndex === pageIndex) {
        renderItems.push({ ann, rects: ann.rects ?? [] })
      }
    }
  }

  if (renderItems.length === 0) return null

  return (
    <div style={styles.layer}>
      {renderItems.map(({ ann, rects }) =>
        rects.map((r, i) => {
          const shrink = r.height * containerSize.height * 0.15
          return (
            <div
              key={`${ann.id}-${pageIndex}-${i}`}
              title={ann.text}
              style={
                ann.type === 'region'
                  ? {
                      ...styles.mark,
                      top:    r.top    * containerSize.height,
                      left:   r.left   * containerSize.width,
                      width:  r.width  * containerSize.width,
                      height: r.height * containerSize.height,
                      background: 'transparent',
                      border: `2px solid ${getHighlightColor(ann.color)}`,
                      mixBlendMode: 'normal',
                    }
                  : {
                      ...styles.mark,
                      top:    r.top    * containerSize.height + shrink,
                      left:   r.left   * containerSize.width,
                      width:  r.width  * containerSize.width,
                      height: r.height * containerSize.height - shrink * 2,
                      background: getHighlightColor(ann.color),
                    }
              }
              onClick={() => onClickAnnotation?.(ann, pageIndex)}
            />
          )
        })
      )}
    </div>
  )
}

const styles = {
  layer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 3,
  },
  mark: {
    position: 'absolute',
    pointerEvents: 'auto',
    cursor: 'pointer',
    borderRadius: 2,
    mixBlendMode: 'multiply',
  },
}
