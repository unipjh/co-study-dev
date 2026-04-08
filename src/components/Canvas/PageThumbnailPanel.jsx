import { useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'

/**
 * 페이지 썸네일 오버레이 패널
 * - TopToolbar 바로 아래 absolute overlay
 * - 뷰포트 진입 시에만 실제 PDF Page 렌더링 (IntersectionObserver)
 * - 현재 페이지 자동 스크롤 + 강조 테두리
 *
 * @param {{ pdfBlob, numPages, currentPage, onPageSelect, onClose }} props
 */
export default function PageThumbnailPanel({ pdfBlob, numPages, currentPage, onPageSelect, onClose }) {
  const panelRef  = useRef(null)
  const activeRef = useRef(null)

  // 패널 열릴 때 현재 페이지 썸네일로 스크롤
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [])

  // 외부 클릭 닫기
  useEffect(() => {
    function handlePointerDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  if (!pdfBlob || numPages === 0) return null

  return (
    <div ref={panelRef} style={styles.panel}>
      <Document
        file={pdfBlob}
        loading={null}
        onLoadError={() => {}}
      >
        <div style={styles.grid}>
          {Array.from({ length: numPages }, (_, i) => {
            const pageNum  = i + 1
            const isCurrent = pageNum === currentPage
            return (
              <ThumbnailCell
                key={pageNum}
                pageNum={pageNum}
                isCurrent={isCurrent}
                ref={isCurrent ? activeRef : null}
                onClick={() => { onPageSelect(pageNum); onClose() }}
              />
            )
          })}
        </div>
      </Document>
    </div>
  )
}

/** 개별 썸네일 셀 — IntersectionObserver로 지연 렌더링 */
import { forwardRef } from 'react'

const ThumbnailCell = forwardRef(function ThumbnailCell({ pageNum, isCurrent, onClick }, ref) {
  const cellRef   = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = cellRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={(el) => {
        cellRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      style={{
        ...styles.cell,
        ...(isCurrent ? styles.cellActive : {}),
      }}
      onClick={onClick}
    >
      <div style={styles.pageBox}>
        {visible ? (
          <Page
            pageNumber={pageNum}
            width={88}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ) : (
          <div style={styles.placeholder} />
        )}
      </div>
      <p style={{ ...styles.pageNum, ...(isCurrent ? styles.pageNumActive : {}) }}>
        {pageNum}
      </p>
    </div>
  )
})

const styles = {
  panel: {
    position: 'absolute',
    top: 48,       // TopToolbar 높이
    left: 0,
    right: 0,
    zIndex: 50,
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    maxHeight: 180,
    overflowY: 'hidden',
  },
  grid: {
    display: 'flex',
    gap: 8,
    padding: '10px 16px',
    overflowX: 'auto',
    overflowY: 'hidden',
    alignItems: 'flex-start',
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    flexShrink: 0,
    padding: 3,
    borderRadius: 5,
    border: '2px solid transparent',
    transition: 'border-color 0.12s',
  },
  cellActive: {
    border: '2px solid #6366f1',
    borderRadius: 5,
  },
  pageBox: {
    width: 88,
    minHeight: 120,
    background: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: 88,
    height: 120,
    background: '#e8e8e8',
  },
  pageNum: {
    fontSize: 10,
    color: '#999',
    lineHeight: 1,
  },
  pageNumActive: {
    color: '#6366f1',
    fontWeight: 700,
  },
}
