import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { extractSelection, mergeLineRects } from '../../lib/selectionUtils'
import useDocumentStore from '../../store/documentStore'
import useAnnotation from '../../hooks/useAnnotation'
import useAI from '../AI/useAI'
import HighlightLayer from './HighlightLayer'
import SelectionToolbar from './SelectionToolbar'
import AnnotationPopup from './AnnotationPopup'
import AIInlinePopup from './AIInlinePopup'

function SelectionOverlay({ rects }) {
  if (!rects || rects.length === 0) return null
  return (
    <div style={overlayLayerStyle}>
      {rects.map((r, i) => {
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
const overlayLayerStyle  = { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }
const regionCaptureStyle = { position: 'absolute', inset: 0, zIndex: 5, cursor: 'crosshair' }

function RegionDragPreview({ drag }) {
  const { x0, y0, x1, y1 } = drag
  return (
    <div
      style={{
        position: 'absolute',
        left:   Math.min(x0, x1),
        top:    Math.min(y0, y1),
        width:  Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
        border: '2px solid #6366f1',
        background: 'rgba(99,102,241,0.12)',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    />
  )
}

const SIDEBAR_TABS = [
  { key: 'chat',    label: 'Chat' },
  { key: 'memo',    label: 'Memo' },
  { key: 'mindmap', label: 'Map' },
]

export default function DocumentCanvas({ docId, onSendToChat, activeTab, onTabChange, sidebarOpen }) {
  const { pdfBlob, currentPage, numPages, zoomLevel, viewMode, selectionMode, setNumPages, setCurrentPage, setViewMode, setSelectionMode } =
    useDocumentStore()

  const { annotations, add: addAnnotation, update: updateAnnotation, remove: removeAnnotation } =
    useAnnotation(docId)

  const { ask, response, isStreaming, reset } = useAI()

  const pdfFile = useMemo(() => pdfBlob ?? null, [pdfBlob])

  const [selection, setSelection]               = useState(null)
  const [dragRects, setDragRects]               = useState(null)
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [containerSize, setContainerSize]       = useState(null)
  const [aiState, setAiState]                   = useState(null)
  // 멀티 드래그 누적 그룹
  const [pendingGroups, setPendingGroups]       = useState([])
  const [barCollapsed, setBarCollapsed]         = useState(false)

  const pageContainerRef = useRef(null)
  const firstScrollRef   = useRef(null)
  const pageRefs         = useRef({})
  const outerRef         = useRef(null)  // 스크롤 컨테이너 (pan mode용)

  // 영역 선택 드래그 상태
  const [regionDrag, setRegionDrag] = useState(null)

  // 페이지→스크롤 전환 시 위치 유지용
  const prevViewModeRef   = useRef(viewMode)
  const scrollToPageRef   = useRef(currentPage)

  useEffect(() => {
    scrollToPageRef.current = currentPage
  }, [currentPage])

  // ── 페이지→스크롤 전환 시 현재 페이지로 스크롤 ───────────────
  useEffect(() => {
    if (viewMode === 'scroll' && prevViewModeRef.current === 'page') {
      const pageIdx = scrollToPageRef.current - 1
      // 스크롤 모드로 렌더 완료 후 이동
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = pageRefs.current[pageIdx]
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
        })
      })
    }
    prevViewModeRef.current = viewMode
  }, [viewMode])

  // ── 키보드 방향키 페이지 전환 (page 모드 전용) ────────────────
  useEffect(() => {
    function handleKeyDown(e) {
      if (viewMode !== 'page') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrentPage(Math.max(1, currentPage - 1))
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCurrentPage(Math.min(numPages, currentPage + 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, currentPage, numPages, setCurrentPage])

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

  useEffect(() => {
    function handleSelectionChange() {
      if (selectionMode === 'pan') return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setDragRects(null)
        return
      }

      const range      = sel.getRangeAt(0)
      const anchorNode = sel.anchorNode

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
  }, [viewMode, currentPage, selectionMode])

  // ── 스크롤 모드에서 올바른 페이지 컨테이너 찾기 ───────────────
  function findScrollContainer() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return { container: null, selPageIndex: 0 }
    const anchorNode = sel.anchorNode
    for (const [idx, el] of Object.entries(pageRefs.current)) {
      if (el && el.contains(anchorNode)) {
        return { container: el, selPageIndex: Number(idx) }
      }
    }
    return { container: null, selPageIndex: 0 }
  }

  const handleMouseUp = useCallback(() => {
    if (selectionMode === 'region') return
    if (selectionMode === 'pan') return

    let container = null
    let selPageIndex = currentPage - 1

    if (viewMode === 'page') {
      container = pageContainerRef.current
    } else {
      const found = findScrollContainer()
      container    = found.container
      selPageIndex = found.selPageIndex
    }

    if (!container) { setDragRects(null); return }

    const info = extractSelection(container, selPageIndex)
    if (info) {
      // removeAllRanges 하지 않음 → 사용자가 Ctrl+C로 복사 가능
      setActiveAnnotation(null)
      setAiState(null)
      setSelection(info)
    } else {
      setDragRects(null)
    }
  }, [currentPage, viewMode, selectionMode])

  // 트리플 클릭 → 해당 줄 전체 선택
  const handleTripleClick = useCallback((e, pageIndex, containerEl) => {
    if (e.detail < 3) return
    if (selectionMode === 'region') return

    const textLayer = containerEl?.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    const clickY = e.clientY
    const spans = Array.from(textLayer.querySelectorAll('span'))
      .filter((s) => s.textContent.trim().length > 0)

    const lineSpans = spans.filter((span) => {
      const r = span.getBoundingClientRect()
      return r.height > 0 && clickY >= r.top && clickY <= r.bottom
    })
    if (lineSpans.length === 0) return

    const firstSpan = lineSpans[0]
    const lastSpan  = lineSpans[lineSpans.length - 1]
    const firstNode = firstSpan.firstChild
    const lastNode  = lastSpan.lastChild

    if (!firstNode || !lastNode) return

    const range = document.createRange()
    range.setStart(firstNode, 0)
    range.setEnd(lastNode, lastNode.textContent?.length ?? 0)

    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    handleMouseUp()
  }, [selectionMode, handleMouseUp])

  // 페이지 전체 텍스트 선택
  const handleSelectAll = useCallback(() => {
    if (selectionMode === 'region' || viewMode !== 'page') return
    const container = pageContainerRef.current
    if (!container) return

    const textLayer = container.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    const range = document.createRange()
    range.selectNodeContents(textLayer)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    handleMouseUp()
  }, [selectionMode, viewMode, handleMouseUp])

  // ── Pan 모드 드래그 스크롤 ────────────────────────────────────
  const handlePanMouseDown = useCallback((e) => {
    if (selectionMode !== 'pan') return
    if (e.button !== 0) return
    const container = outerRef.current
    if (!container) return

    const startX     = e.clientX
    const startY     = e.clientY
    const initLeft   = container.scrollLeft
    const initTop    = container.scrollTop

    container.style.cursor = 'grabbing'

    function onMouseMove(ev) {
      container.scrollLeft = initLeft - (ev.clientX - startX)
      container.scrollTop  = initTop  - (ev.clientY - startY)
    }
    function onMouseUp() {
      container.style.cursor = 'grab'
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    e.preventDefault()
  }, [selectionMode])

  // ── 영역 선택 핸들러 ──────────────────────────────────────────
  function handleRegionMouseDown(e, pageIndex, containerEl) {
    if (selectionMode !== 'region') return
    e.preventDefault()
    const r = containerEl.getBoundingClientRect()
    setRegionDrag({
      containerEl,
      pageIndex,
      x0: e.clientX - r.left,
      y0: e.clientY - r.top,
      x1: e.clientX - r.left,
      y1: e.clientY - r.top,
    })
  }

  useEffect(() => {
    if (!regionDrag) return

    function onMouseMove(e) {
      setRegionDrag((prev) => {
        if (!prev) return null
        const r = prev.containerEl.getBoundingClientRect()
        return { ...prev, x1: e.clientX - r.left, y1: e.clientY - r.top }
      })
    }

    function onMouseUp(e) {
      setRegionDrag((prev) => {
        if (!prev) return null
        const { containerEl, pageIndex, x0, y0 } = prev
        const x1 = e.clientX - containerEl.getBoundingClientRect().left
        const y1 = e.clientY - containerEl.getBoundingClientRect().top
        const cw  = containerEl.getBoundingClientRect().width
        const ch  = containerEl.getBoundingClientRect().height

        const left   = Math.min(x0, x1) / cw
        const top    = Math.min(y0, y1) / ch
        const width  = Math.abs(x1 - x0) / cw
        const height = Math.abs(y1 - y0) / ch

        if (width > 0.01 && height > 0.01) {
          const cr = containerEl.getBoundingClientRect()
          setActiveAnnotation(null)
          setAiState(null)
          setSelection({
            pageIndex,
            text:        '[영역 선택]',
            rects:       [{ top, left, width, height }],
            spanIndex:   0,
            startOffset: 0,
            endOffset:   0,
            isRegion:    true,
            viewportRect: {
              top:    cr.top    + Math.min(y0, y1),
              left:   cr.left   + Math.min(x0, x1),
              width:  Math.abs(x1 - x0),
              bottom: cr.top    + Math.max(y0, y1),
            },
          })
        }
        return null
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [regionDrag])

  // 색상 선택 완료 → 단일 또는 멀티 드래그 annotation 저장
  function handleSelectionSave(color, content) {
    if (!selection) return
    const groups = [...pendingGroups, selection]
    addAnnotation(groups, color, content)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setPendingGroups([])
  }

  // "추가 선택" — 현재 selection을 pending에 쌓고 toolbar 닫기
  function handleAddSelection() {
    if (!selection) return
    window.getSelection()?.removeAllRanges()
    setPendingGroups((prev) => [...prev, selection])
    setSelection(null)
    setDragRects(null)
  }

  // 누적 초기화
  function handleClearPending() {
    setPendingGroups([])
  }

  // 누적 항목 개별 제거
  function handleRemovePending(index) {
    setPendingGroups((prev) => prev.filter((_, i) => i !== index))
  }

  // 소프트 닫기: toolbar만 닫음, pendingGroups 보존 (외부 클릭, 페이지 이동 등)
  function handleSoftClose() {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setDragRects(null)
  }

  // 명시적 취소: pendingGroups까지 초기화 (취소 버튼, 모두 지우기)
  function handleSelectionClose() {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setDragRects(null)
    setPendingGroups([])
  }

  // ── 영역 선택 이미지 캡처 (pdf.js 캔버스 크롭) ───────────────
  function captureRegionAsBase64(containerEl, rects) {
    if (!containerEl || !rects?.length) return null
    const pageCanvas = containerEl.querySelector('canvas')
    if (!pageCanvas) return null
    const displayRect = containerEl.getBoundingClientRect()
    const rect = rects[0]  // 영역 선택은 단일 rect
    const scaleX = pageCanvas.width / displayRect.width
    const scaleY = pageCanvas.height / displayRect.height
    const srcX = Math.round(rect.left   * displayRect.width  * scaleX)
    const srcY = Math.round(rect.top    * displayRect.height * scaleY)
    const srcW = Math.round(rect.width  * displayRect.width  * scaleX)
    const srcH = Math.round(rect.height * displayRect.height * scaleY)
    if (srcW <= 0 || srcH <= 0) return null
    const tmp = document.createElement('canvas')
    tmp.width  = srcW
    tmp.height = srcH
    const ctx = tmp.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(pageCanvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)
    return tmp.toDataURL('image/png').split(',')[1]  // base64 (prefix 제거)
  }

  function handleSendImageToChat() {
    if (!selection || !selection.isRegion) return
    const containerEl = viewMode === 'page'
      ? pageContainerRef.current
      : pageRefs.current[selection.pageIndex]
    const imageData = captureRegionAsBase64(containerEl, selection.rects)
    onSendToChat?.({
      id:        `region_${Date.now()}`,
      type:      'region',
      text:      '[영역 선택]',
      color:     'blue',
      pageIndex: selection.pageIndex,
      content:   '',
      imageData,
    })
    handleSoftClose()
  }

  function handleAnnotationClick(ann) {
    setSelection(null)
    setDragRects(null)
    setActiveAnnotation(ann)
  }

  function handleAITutor() {
    if (!selection) return
    const saved = selection
    setAiState({ selectionInfo: saved })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setDragRects(null)
    setPendingGroups([])
    reset()
    ask(saved.text, 'explain')
  }

  function handleAISaveAsMemo() {
    if (!aiState || !response) return
    addAnnotation([aiState.selectionInfo], 'purple', response)
    setAiState(null)
    reset()
  }

  function handleAISendToChat() {
    if (!aiState) return
    onSendToChat?.({
      id:        `ai_${Date.now()}`,
      text:      aiState.selectionInfo.text,
      color:     'purple',
      pageIndex: aiState.selectionInfo.pageIndex,
    })
    setAiState(null)
    reset()
  }

  // pending 오버레이: 각 그룹의 rects를 현재 페이지에서 표시
  const pendingOverlayRects = pendingGroups
    .filter((g) => g.pageIndex === currentPage - 1)
    .flatMap((g) => g.rects)

  // pan 모드 outer 스타일
  const outerStyle = {
    ...styles.outer,
    cursor: selectionMode === 'pan' ? 'grab' : undefined,
    userSelect: selectionMode === 'pan' ? 'none' : undefined,
  }

  if (!pdfBlob) {
    return (
      <div style={styles.canvasWrapper}>
        <div style={styles.outer}>
          <p style={styles.hint}>문서를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.canvasWrapper}>
      <div
        ref={outerRef}
        style={outerStyle}
        onMouseUp={handleMouseUp}
        onMouseDown={handlePanMouseDown}
      >
        <Document
          file={pdfFile}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(err) => console.error('PDF load error:', err)}
          loading={<div style={styles.loading}>PDF 불러오는 중...</div>}
        >
          {viewMode === 'page' ? (
            <div
              style={styles.pageWrapper}
              ref={pageContainerRef}
              onClick={(e) => handleTripleClick(e, currentPage - 1, pageContainerRef.current)}
            >
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
              {/* 멀티 드래그 누적 오버레이 */}
              {pendingOverlayRects.length > 0 && (
                <SelectionOverlay rects={pendingOverlayRects} />
              )}
              {dragRects && dragRects.pageIndex === currentPage - 1 && (
                <SelectionOverlay rects={dragRects.rects} />
              )}
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
              {/* 영역 선택 오버레이 */}
              {selectionMode === 'region' && (
                <div
                  style={regionCaptureStyle}
                  onMouseDown={(e) => handleRegionMouseDown(e, currentPage - 1, pageContainerRef.current)}
                />
              )}
              {regionDrag && regionDrag.pageIndex === currentPage - 1 && (
                <RegionDragPreview drag={regionDrag} />
              )}
            </div>
          ) : (
            Array.from({ length: numPages }, (_, i) => {
              const isFirst = i === 0
              const pendingRects = pendingGroups
                .filter((g) => g.pageIndex === i)
                .flatMap((g) => g.rects)
              return (
                <div
                  key={i + 1}
                  ref={(el) => {
                    if (isFirst) firstScrollRef.current = el
                    if (el) pageRefs.current[i] = el
                    else delete pageRefs.current[i]
                  }}
                  style={{ ...styles.pageWrapper, marginBottom: 16 }}
                  onClick={(e) => handleTripleClick(e, i, pageRefs.current[i])}
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
                  {pendingRects.length > 0 && (
                    <SelectionOverlay rects={pendingRects} />
                  )}
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
                  {selectionMode === 'region' && (
                    <div
                      style={regionCaptureStyle}
                      onMouseDown={(e) => handleRegionMouseDown(e, i, pageRefs.current[i])}
                    />
                  )}
                  {regionDrag && regionDrag.pageIndex === i && (
                    <RegionDragPreview drag={regionDrag} />
                  )}
                </div>
              )
            })
          )}
        </Document>
      </div>

      {/* 양 옆 페이지 이동 버튼 */}
      {viewMode === 'page' && numPages > 0 && (
        <>
          <button
            style={{ ...styles.pageNavBtn, left: 12, opacity: currentPage <= 1 ? 0.25 : 0.65 }}
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            ‹
          </button>
          <button
            style={{ ...styles.pageNavBtn, right: 12, opacity: currentPage >= numPages ? 0.25 : 0.65 }}
            onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
          >
            ›
          </button>
        </>
      )}

      {/* 하단 플로팅 컨트롤 바 */}
      <div style={styles.bottomBar}>
        {!barCollapsed && (
          <>
            <button
              title="페이지 뷰"
              style={{ ...styles.barBtn, ...(viewMode === 'page' ? styles.barBtnActive : {}) }}
              onClick={() => setViewMode('page')}
            >
              페이지
            </button>
            <button
              title="스크롤 뷰"
              style={{ ...styles.barBtn, ...(viewMode === 'scroll' ? styles.barBtnActive : {}) }}
              onClick={() => setViewMode('scroll')}
            >
              스크롤
            </button>

            <span style={styles.barDivider} />

            <button
              title="텍스트 선택"
              style={{ ...styles.barBtn, ...(selectionMode === 'text' ? styles.barBtnActive : {}), fontWeight: 700 }}
              onClick={() => setSelectionMode('text')}
            >
              T
            </button>
            <button
              title="영역 선택"
              style={{ ...styles.barBtn, ...(selectionMode === 'region' ? styles.barBtnActive : {}) }}
              onClick={() => setSelectionMode('region')}
            >
              ⬚
            </button>
            <button
              title="손 커서 (화면 이동)"
              style={{ ...styles.barBtn, ...(selectionMode === 'pan' ? styles.barBtnActive : {}) }}
              onClick={() => setSelectionMode('pan')}
            >
              ✋
            </button>

            {selectionMode === 'text' && viewMode === 'page' && (
              <>
                <span style={styles.barDivider} />
                <button
                  title="현재 페이지 텍스트 전체 선택"
                  style={styles.barBtn}
                  onClick={handleSelectAll}
                >
                  전체선택
                </button>
              </>
            )}

            <span style={styles.barDivider} />
          </>
        )}

        <button
          title={barCollapsed ? '컨트롤 펼치기' : '컨트롤 접기'}
          style={styles.barCollapseBtn}
          onClick={() => setBarCollapsed((v) => !v)}
        >
          {barCollapsed ? '⌃' : '⌄'}
        </button>

        {sidebarOpen && (
          <>
            <span style={styles.barSpacer} />
            {SIDEBAR_TABS.map((tab) => (
              <button
                key={tab.key}
                title={tab.label}
                style={{
                  ...styles.barBtn,
                  ...(activeTab === tab.key ? styles.barBtnActive : {}),
                  ...(tab.disabled ? styles.barBtnDisabled : {}),
                }}
                onClick={() => !tab.disabled && onTabChange?.(tab.key)}
                disabled={tab.disabled}
              >
                {tab.label}
              </button>
            ))}
          </>
        )}
      </div>

      {selection && (
        <SelectionToolbar
          viewportRect={selection.viewportRect}
          onSave={handleSelectionSave}
          onClose={handleSoftClose}
          onAITutor={handleAITutor}
          pendingGroups={pendingGroups}
          pendingCount={pendingGroups.length}
          onAddSelection={handleAddSelection}
          onClearPending={handleSelectionClose}
          onRemovePending={handleRemovePending}
          isRegion={!!selection.isRegion}
          onSendImageToChat={handleSendImageToChat}
        />
      )}

      {aiState && (
        <AIInlinePopup
          viewportRect={aiState.selectionInfo.viewportRect}
          selectedText={aiState.selectionInfo.text}
          response={response}
          isStreaming={isStreaming}
          onSaveAsMemo={handleAISaveAsMemo}
          onSendToChat={handleAISendToChat}
          onClose={() => { setAiState(null); reset() }}
        />
      )}
    </div>
  )
}

const styles = {
  canvasWrapper: {
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
  },
  outer: {
    flex: 1,
    overflow: 'auto',
    background: '#e8e8e8',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 24,
  },
  hint: { color: '#aaa', fontSize: 15, alignSelf: 'center' },
  loading: { color: '#999', padding: 24 },
  pageWrapper: {
    position: 'relative',
    display: 'inline-block',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    background: 'rgba(26,26,26,0.82)',
    backdropFilter: 'blur(8px)',
    borderRadius: 12,
    padding: '5px 8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
    userSelect: 'none',
  },
  barBtn: {
    padding: '4px 10px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    lineHeight: 1.3,
    transition: 'background 0.12s, color 0.12s',
  },
  barBtnActive: {
    background: 'rgba(255,255,255,0.18)',
    color: '#fff',
    fontWeight: 700,
  },
  barDivider: {
    width: 1,
    height: 16,
    background: 'rgba(255,255,255,0.2)',
    margin: '0 4px',
    flexShrink: 0,
  },
  barSpacer: {
    flex: 1,
    minWidth: 16,
  },
  barBtnDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  barCollapseBtn: {
    padding: '2px 6px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.45)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    lineHeight: 1,
    flexShrink: 0,
  },
  pageNavBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'rgba(26,26,26,0.75)',
    color: '#fff',
    fontSize: 24,
    cursor: 'pointer',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    lineHeight: 1,
    transition: 'opacity 0.15s',
  },
}
