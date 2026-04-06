import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { extractSelection, mergeLineRects } from '../../lib/selectionUtils'
import useDocumentStore from '../../store/documentStore'
import useAnnotation from '../../hooks/useAnnotation'
import HighlightLayer from './HighlightLayer'
import SelectionToolbar from './SelectionToolbar'
import AnnotationPopup from './AnnotationPopup'

// 드래그 중 / mouseup 후 둘 다 사용하는 공통 오버레이
function SelectionOverlay({ rects }) {
  if (!rects || rects.length === 0) return null
  return (
    <div style={overlayLayerStyle}>
      {rects.map((r, i) => {
        // 줄 간 겹침 제거: 높이를 85%로 줄이고 수직 중앙 정렬
        const shrink = r.height * 0.15
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top:    `${(r.top + shrink) * 100}%`,
              left:   `${r.left * 100}%`,
              width:  `${r.width * 100}%`,
              height: `${(r.height - shrink * 2) * 100}%`,
              background: 'rgba(99, 102, 241, 0.35)',
              mixBlendMode: 'multiply',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          />
        )
      })}
    </div>
  )
}
const overlayLayerStyle = { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }

export default function DocumentCanvas({ docId, onSendToChat }) {
  const { pdfBlob, currentPage, numPages, zoomLevel, viewMode, setNumPages } =
    useDocumentStore()

  const { annotations, add: addAnnotation, update: updateAnnotation, remove: removeAnnotation } =
    useAnnotation(docId)

  const pdfFile = useMemo(() => pdfBlob ?? null, [pdfBlob])

  const [selection, setSelection]               = useState(null)
  const [dragRects, setDragRects]               = useState(null)  // { pageIndex, rects } | null
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [containerSize, setContainerSize]       = useState(null)

  const pageContainerRef = useRef(null)
  const firstScrollRef   = useRef(null)
  const pageRefs         = useRef({})  // scroll 모드: pageIndex → DOM element

  // zoom 변경 시 containerSize 재측정
  useEffect(() => {
    setContainerSize(null)
  }, [zoomLevel])

  function measureContainer(el) {
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (width > 0 && height > 0) setContainerSize({ width, height })
  }

  function handlePageRenderSuccess() {
    measureContainer(pageContainerRef.current)
  }

  function handleFirstScrollRenderSuccess() {
    measureContainer(firstScrollRef.current)
  }

  // selectionchange → 드래그 중 실시간 커스텀 오버레이
  // ::selection은 투명 처리, 이 핸들러가 시각적 피드백 전담
  useEffect(() => {
    function handleSelectionChange() {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setDragRects(null)
        return
      }

      const range = sel.getRangeAt(0)
      const anchorNode = sel.anchorNode

      // 어느 pageWrapper에 속하는지 판별
      let container = null
      let pageIndex = 0

      if (viewMode === 'page') {
        if (pageContainerRef.current?.contains(anchorNode)) {
          container = pageContainerRef.current
          pageIndex = currentPage - 1
        }
      } else {
        for (const [idx, el] of Object.entries(pageRefs.current)) {
          if (el.contains(anchorNode)) {
            container = el
            pageIndex = Number(idx)
            break
          }
        }
      }

      if (!container) { setDragRects(null); return }

      const containerRect = container.getBoundingClientRect()
      const clientRects   = Array.from(range.getClientRects())
      if (clientRects.length === 0) return

      const rects = mergeLineRects(
        clientRects
          .map(r => ({
            top:    (r.top    - containerRect.top)    / containerRect.height,
            left:   (r.left   - containerRect.left)   / containerRect.width,
            width:  r.width   / containerRect.width,
            height: r.height  / containerRect.height,
          }))
          .filter(r => r.width > 0.001 && r.height > 0)
      )

      setDragRects({ pageIndex, rects })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [viewMode, currentPage])

  // 마우스 업 → dragRects 제거 후 SelectionOverlay(selection.rects)로 교체
  const handleMouseUp = useCallback(() => {
    const container = viewMode === 'page' ? pageContainerRef.current : firstScrollRef.current
    if (!container) return
    const info = extractSelection(container, currentPage - 1)
    if (info) {
      window.getSelection()?.removeAllRanges()  // selectionchange → dragRects null
      setDragRects(null)
      setActiveAnnotation(null)
      setSelection(info)
    } else {
      setDragRects(null)
    }
  }, [currentPage, viewMode])

  function handleSelectionSave(color, content) {
    if (!selection) return
    addAnnotation(selection, color, content)
    setSelection(null)
  }

  function handleSelectionClose() {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setDragRects(null)
  }

  function handleAnnotationClick(ann) {
    setSelection(null)
    setDragRects(null)
    setActiveAnnotation(ann)
  }

  if (!pdfBlob) {
    return (
      <div style={styles.empty}>
        <p style={styles.hint}>문서를 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div style={styles.outer} onMouseUp={handleMouseUp}>
      <Document
        file={pdfFile}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        onLoadError={(err) => console.error('PDF load error:', err)}
        loading={<div style={styles.loading}>PDF 불러오는 중...</div>}
      >
        {viewMode === 'page' ? (
          <div style={styles.pageWrapper} ref={pageContainerRef}>
            <Page
              pageNumber={currentPage}
              scale={zoomLevel}
              renderTextLayer={true}
              renderAnnotationLayer={false}
              onRenderSuccess={handlePageRenderSuccess}
            />
            <HighlightLayer
              annotations={annotations}
              pageIndex={currentPage - 1}
              containerSize={containerSize}
              onClickAnnotation={handleAnnotationClick}
            />
            {/* 드래그 중 실시간 오버레이 */}
            {dragRects && dragRects.pageIndex === currentPage - 1 && (
              <SelectionOverlay rects={dragRects.rects} />
            )}
            {/* mouseup 후 툴바가 열려 있는 동안 유지 */}
            {selection && selection.pageIndex === currentPage - 1 && (
              <SelectionOverlay rects={selection.rects} />
            )}
            {activeAnnotation && activeAnnotation.pageIndex === currentPage - 1 && (
              <AnnotationPopup
                annotation={activeAnnotation}
                containerSize={containerSize}
                onUpdate={updateAnnotation}
                onDelete={(id) => { removeAnnotation(id); setActiveAnnotation(null) }}
                onSendToChat={(ann) => { onSendToChat?.(ann); setActiveAnnotation(null) }}
                onClose={() => setActiveAnnotation(null)}
              />
            )}
          </div>
        ) : (
          Array.from({ length: numPages }, (_, i) => {
            const isFirst = i === 0
            return (
              <div
                key={i + 1}
                ref={(el) => {
                  if (isFirst) firstScrollRef.current = el
                  if (el) pageRefs.current[i] = el
                  else delete pageRefs.current[i]
                }}
                style={{ ...styles.pageWrapper, marginBottom: 16 }}
              >
                <Page
                  pageNumber={i + 1}
                  scale={zoomLevel}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                  onRenderSuccess={isFirst ? handleFirstScrollRenderSuccess : undefined}
                />
                <HighlightLayer
                  annotations={annotations}
                  pageIndex={i}
                  containerSize={containerSize}
                  onClickAnnotation={handleAnnotationClick}
                />
                {dragRects && dragRects.pageIndex === i && (
                  <SelectionOverlay rects={dragRects.rects} />
                )}
                {selection && selection.pageIndex === i && (
                  <SelectionOverlay rects={selection.rects} />
                )}
                {activeAnnotation && activeAnnotation.pageIndex === i && (
                  <AnnotationPopup
                    annotation={activeAnnotation}
                    containerSize={containerSize}
                    onUpdate={updateAnnotation}
                    onDelete={(id) => { removeAnnotation(id); setActiveAnnotation(null) }}
                    onSendToChat={(ann) => { onSendToChat?.(ann); setActiveAnnotation(null) }}
                    onClose={() => setActiveAnnotation(null)}
                  />
                )}
              </div>
            )
          })
        )}
      </Document>

      {selection && (
        <SelectionToolbar
          viewportRect={selection.viewportRect}
          onSave={handleSelectionSave}
          onClose={handleSelectionClose}
        />
      )}
    </div>
  )
}

const styles = {
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fafafa',
  },
  hint: { color: '#aaa', fontSize: 15 },
  loading: { color: '#999', padding: 24 },
  outer: {
    flex: 1,
    overflow: 'auto',
    background: '#e8e8e8',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 24,
  },
  pageWrapper: {
    position: 'relative',
    display: 'inline-block',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
}
