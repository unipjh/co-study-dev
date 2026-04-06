const COLOR_MAP = {
  yellow: 'rgba(255, 215, 0, 0.45)',
  blue:   'rgba(107, 181, 255, 0.45)',
  green:  'rgba(92, 204, 127, 0.45)',
}

/**
 * PDF 페이지 위에 annotation 하이라이트를 텍스트 줄 단위로 오버레이.
 * rects[] 배열을 사용해 이미지·공백 영역은 제외된다.
 *
 * @param {{ annotations, pageIndex, containerSize, onClickAnnotation }} props
 */
export default function HighlightLayer({ annotations, pageIndex, containerSize, onClickAnnotation }) {
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex)
  if (!pageAnnotations.length || !containerSize) return null

  return (
    <div style={styles.layer}>
      {pageAnnotations.map((ann) =>
        (ann.rects ?? []).map((r, i) => {
          const shrink = r.height * containerSize.height * 0.15
          return (
            <div
              key={`${ann.id}-${i}`}
              title={ann.text}
              style={{
                ...styles.mark,
                top:    r.top    * containerSize.height + shrink,
                left:   r.left   * containerSize.width,
                width:  r.width  * containerSize.width,
                height: r.height * containerSize.height - shrink * 2,
                background: COLOR_MAP[ann.color] ?? COLOR_MAP.yellow,
              }}
              onClick={() => onClickAnnotation?.(ann)}
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
