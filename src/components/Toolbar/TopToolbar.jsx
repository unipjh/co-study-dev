import { useEffect, useState } from 'react'
import useDocumentStore from '../../store/documentStore'

export default function TopToolbar({
  onHome,
  onPageLabelClick,
  onPageChange,
  questionGateEnabled = true,
  onToggleQuestionGate,
}) {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const {
    pdfName,
    currentPage,
    numPages,
    zoomLevel,
    viewMode,
    setCurrentPage,
    setZoomLevel,
    setViewMode,
  } = useDocumentStore()
  const isCompact = viewportWidth < 760

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function movePage(page) {
    if (onPageChange) onPageChange(page)
    else setCurrentPage(page)
  }

  function updateZoom(delta) {
    setZoomLevel(Math.round((zoomLevel + delta) * 10) / 10)
  }

  return (
    <div style={{ ...styles.bar, ...(isCompact ? styles.barCompact : {}) }}>
      <div style={{ ...styles.left, ...(isCompact ? styles.leftCompact : {}) }}>
        {onHome && (
          <button type="button" style={styles.backBtn} onClick={onHome} aria-label="문서 목록으로 돌아가기" title="문서 목록">
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <span style={{ ...styles.fileName, ...(isCompact ? styles.fileNameCompact : {}) }} title={pdfName || '파일명'}>
          {pdfName || '파일명'}
        </span>
      </div>

      <div style={{ ...styles.center, ...(isCompact ? styles.centerCompact : {}) }} aria-label="문서 보기 도구">
        <div style={styles.zoomGroup}>
          <button
            type="button"
            style={{ ...styles.iconBtn, opacity: zoomLevel <= 0.3 ? 0.45 : 1 }}
            disabled={zoomLevel <= 0.3}
            onClick={() => updateZoom(-0.1)}
            aria-label="축소"
            title="축소"
          >
            -
          </button>
          <span style={styles.zoomLabel}>{Math.round(zoomLevel * 100)}%</span>
          <button
            type="button"
            style={{ ...styles.iconBtn, opacity: zoomLevel >= 2 ? 0.45 : 1 }}
            disabled={zoomLevel >= 2}
            onClick={() => updateZoom(0.1)}
            aria-label="확대"
            title="확대"
          >
            +
          </button>
        </div>

        {numPages > 0 && (
          <>
            <span style={styles.divider} />
            <div style={styles.pageGroup}>
              <button
                type="button"
                style={{ ...styles.iconBtn, opacity: currentPage <= 1 ? 0.45 : 1 }}
                onClick={() => movePage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                aria-label="이전 페이지"
                title="이전 페이지"
              >
                ‹
              </button>
              <button
                type="button"
                style={styles.pageLabel}
                onClick={onPageLabelClick}
                aria-label="페이지 목록 열기"
                title="페이지 목록"
              >
                {currentPage}/{numPages}
                <span style={styles.caret}>▾</span>
              </button>
              <button
                type="button"
                style={{ ...styles.iconBtn, opacity: currentPage >= numPages ? 0.45 : 1 }}
                onClick={() => movePage(Math.min(numPages, currentPage + 1))}
                disabled={currentPage >= numPages}
                aria-label="다음 페이지"
                title="다음 페이지"
              >
                ›
              </button>
            </div>
          </>
        )}

        <div style={styles.segmented} aria-label="보기 방식">
          <button
            type="button"
            style={{ ...styles.segmentBtn, ...(viewMode === 'page' ? styles.segmentBtnActive : {}) }}
            onClick={() => setViewMode('page')}
          >
            페이지
          </button>
          <button
            type="button"
            style={{ ...styles.segmentBtn, ...(viewMode === 'scroll' ? styles.segmentBtnActive : {}) }}
            onClick={() => setViewMode('scroll')}
          >
            스크롤
          </button>
        </div>
      </div>

      <div style={{ ...styles.right, ...(isCompact ? styles.rightCompact : {}) }}>
        {onToggleQuestionGate && (
          <button
            type="button"
            style={styles.questionToggle}
            onClick={onToggleQuestionGate}
            aria-pressed={questionGateEnabled}
            title="팝업 질문 받기"
          >
            <span style={styles.questionToggleLabel}>💡 팝업 질문 받기</span>
            <span style={{
              ...styles.switchTrack,
              ...(questionGateEnabled ? styles.switchTrackOn : {}),
            }}>
              <span style={{
                ...styles.switchThumb,
                ...(questionGateEnabled ? styles.switchThumbOn : {}),
              }} />
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  bar: {
    minHeight: 78,
    background: '#ffffff',
    borderBottom: '1px solid #d7d7dc',
    boxShadow: '0 4px 4px rgba(0,0,0,0.18)',
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 1fr) auto minmax(220px, 1fr)',
    alignItems: 'center',
    padding: '0 clamp(14px, 1.6vw, 31px)',
    columnGap: 16,
    flexShrink: 0,
    overflow: 'hidden',
    fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    zIndex: 40,
  },
  barCompact: {
    minHeight: 158,
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'auto auto',
    alignContent: 'center',
    padding: '10px 12px',
  },
  left: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    justifySelf: 'start',
    overflow: 'hidden',
  },
  leftCompact: {
    width: '100%',
    gap: 10,
  },
  center: {
    justifySelf: 'center',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  centerCompact: {
    width: '100%',
    justifySelf: 'start',
    justifyContent: 'flex-start',
    gap: 10,
    paddingBottom: 2,
    flexWrap: 'wrap',
    overflowX: 'visible',
  },
  right: {
    minWidth: 0,
    justifySelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  rightCompact: {
    display: 'none',
  },
  backBtn: {
    width: 52,
    height: 38,
    padding: 0,
    background: '#eeeef8',
    color: '#070761',
    borderRadius: 5,
    fontSize: 26,
    fontWeight: 700,
    lineHeight: '34px',
    flexShrink: 0,
  },
  fileName: {
    minWidth: 0,
    maxWidth: 'min(360px, 28vw)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#6e6e6e',
    fontSize: 20,
    fontWeight: 500,
  },
  fileNameCompact: {
    maxWidth: 'calc(100vw - 120px)',
    fontSize: 16,
  },
  zoomGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  pageGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  iconBtn: {
    width: 38,
    height: 38,
    padding: 0,
    borderRadius: 5,
    background: '#eeeef8',
    color: '#111111',
    fontSize: 18,
    fontWeight: 800,
    flexShrink: 0,
  },
  zoomLabel: {
    minWidth: 46,
    color: '#111111',
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center',
    flexShrink: 0,
  },
  pageLabel: {
    minWidth: 100,
    height: 38,
    padding: '0 14px',
    borderRadius: 5,
    background: '#eeeef8',
    color: '#111111',
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexShrink: 0,
  },
  caret: {
    color: '#070761',
    fontSize: 10,
    lineHeight: 1,
  },
  divider: {
    width: 1,
    height: 27,
    background: '#9b9ba8',
    flexShrink: 0,
  },
  segmented: {
    height: 38,
    width: 170,
    borderRadius: 5,
    background: '#eeeef8',
    padding: 4,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 4,
    flexShrink: 0,
  },
  segmentBtn: {
    borderRadius: 5,
    color: '#111111',
    fontSize: 14,
    fontWeight: 700,
    background: 'transparent',
  },
  segmentBtnActive: {
    background: '#070761',
    color: '#ffffff',
    fontWeight: 800,
  },
  questionToggle: {
    minWidth: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 14,
    color: '#484848',
    fontSize: 17,
    lineHeight: 1.5,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  questionToggleLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  switchTrack: {
    position: 'relative',
    width: 52,
    height: 33,
    borderRadius: 999,
    background: '#d9d9d9',
    flexShrink: 0,
    transition: 'background 0.15s ease',
  },
  switchTrackOn: {
    background: '#070761',
  },
  switchThumb: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 25,
    height: 25,
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    transition: 'transform 0.15s ease',
  },
  switchThumbOn: {
    transform: 'translateX(19px)',
  },
}
