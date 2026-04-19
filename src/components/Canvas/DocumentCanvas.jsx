import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { extractSelection, mergeLineRects } from '../../lib/selectionUtils'
import useDocumentStore from '../../store/documentStore'
import useAnnotation from '../../hooks/useAnnotation'
import useAI, { buildRagSystemInstruction, NO_CHUNK_FALLBACK } from '../AI/useAI'
import useDocumentIndex from '../../hooks/useDocumentIndex'
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
const regionCaptureStyle = { position: 'absolute', inset: 0, zIndex: 5, cursor: 'crosshair', touchAction: 'none' }

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

export default function DocumentCanvas({ docId, onSendToChat, activeTab, onTabChange, sidebarOpen, onSidebarToggle }) {
  const { pdfBlob, currentPage, numPages, zoomLevel, viewMode, selectionMode, setNumPages, setCurrentPage, setViewMode, setSelectionMode } =
    useDocumentStore()

  const { annotations, add: addAnnotation, update: updateAnnotation, remove: removeAnnotation } =
    useAnnotation(docId)

  const { ask, response, isStreaming, reset } = useAI()
  const { search: searchIndex, getChunkByPage, indexing, indexed, indexProgress, indexTotal } = useDocumentIndex(docId)

  const pdfFile = useMemo(() => pdfBlob ?? null, [pdfBlob])

  const [selection, setSelection]               = useState(null)
  const [dragRects, setDragRects]               = useState(null)
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [activeAnnotationPage, setActiveAnnotationPage] = useState(null)
  const [containerSize, setContainerSize]       = useState(null)
  const [aiState, setAiState]                   = useState(null)
  const [regionError, setRegionError]           = useState(null)
  // 멀티 드래그 누적 그룹
  const [pendingGroups, setPendingGroups]       = useState([])
  const [wrapperWidth, setWrapperWidth]         = useState(800)

  const pageContainerRef = useRef(null)
  const firstScrollRef   = useRef(null)
  const pageRefs         = useRef({})
  const pageCanvasRef    = useRef(null)   // page 모드 PDF 캔버스 직접 참조
  const scrollCanvasRefs = useRef({})     // scroll 모드 PDF 캔버스 직접 참조
  const outerRef         = useRef(null)  // 스크롤 컨테이너 (pan mode용)
  const wrapperRef       = useRef(null)  // canvasWrapper 너비 측정용
  const navDebounceRef   = useRef(null)  // 방향키 페이지 이동 debounce 타이머
  const targetPageRef    = useRef(null)  // debounce 중 목표 페이지

  // 영역 선택 드래그 상태
  const [regionDrag, setRegionDrag] = useState(null)

  // 페이지→스크롤 전환 시 위치 유지용
  const prevViewModeRef   = useRef(viewMode)
  const scrollToPageRef   = useRef(currentPage)

  useEffect(() => {
    scrollToPageRef.current = currentPage
  }, [currentPage])

  // 페이지 전환 시 AI 인라인 팝업 초기화
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (aiState) { setAiState(null); reset() } }, [currentPage])

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

  // ── canvasWrapper 너비 감지 (하단 바 스케일용) ───────────────
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWrapperWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── 키보드 방향키: 페이지 전환 + Shift+Arrow 선택 영역 확장/축소 ──
  useEffect(() => {
    function handleKeyDown(e) {
      const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      // Shift+Arrow: 브라우저 표준처럼 선택 끝점 확장/축소
      if (e.shiftKey && selection && ARROW_KEYS.includes(e.key)) {
        e.preventDefault()
        const domSel = window.getSelection()
        if (!domSel || domSel.rangeCount === 0) return

        const direction  = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 'forward' : 'backward'
        const granularity = (e.key === 'ArrowLeft'  || e.key === 'ArrowRight') ? 'character' : 'line'
        domSel.modify('extend', direction, granularity)

        // DOM 선택 변경 후 selection 재추출
        let container    = null
        let selPageIndex = currentPage - 1
        if (viewMode === 'page') {
          container = pageContainerRef.current
        } else {
          const anchorNode = domSel.anchorNode
          for (const [idx, el] of Object.entries(pageRefs.current)) {
            if (el?.contains(anchorNode)) {
              container    = el
              selPageIndex = Number(idx)
              break
            }
          }
        }
        if (container) {
          const info = extractSelection(container, selPageIndex)
          if (info) setSelection(info)
          else { setSelection(null); setDragRects(null) }
        }
        return
      }
      // page 모드 방향키 전환 (shift 없을 때)
      if (viewMode !== 'page' || e.shiftKey) return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next = Math.max(1, (targetPageRef.current ?? currentPage) - 1)
        targetPageRef.current = next
        clearTimeout(navDebounceRef.current)
        navDebounceRef.current = setTimeout(() => {
          setCurrentPage(targetPageRef.current)
          targetPageRef.current = null
        }, 120)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(numPages, (targetPageRef.current ?? currentPage) + 1)
        targetPageRef.current = next
        clearTimeout(navDebounceRef.current)
        navDebounceRef.current = setTimeout(() => {
          setCurrentPage(targetPageRef.current)
          targetPageRef.current = null
        }, 120)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, currentPage, numPages, setCurrentPage, selection])

  // ── 터치 팬 + 핀치 줌 ────────────────────────────────────────
  useEffect(() => {
    const el = outerRef.current
    if (!el) return

    let touchMode = null
    let panStartX = 0, panStartY = 0, panInitLeft = 0, panInitTop = 0
    let pinchStartDist = 0, pinchStartZoom = 0

    function getDist(t) {
      return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY)
    }

    function onTouchStart(e) {
      const { selectionMode: sm, zoomLevel: z } = useDocumentStore.getState()
      if (e.touches.length === 2) {
        e.preventDefault()
        touchMode = 'pinch'
        pinchStartDist = getDist(e.touches)
        pinchStartZoom = z
        return
      }
      if (sm === 'pan' && e.touches.length === 1) {
        e.preventDefault()
        touchMode = 'pan'
        panStartX = e.touches[0].clientX; panStartY = e.touches[0].clientY
        panInitLeft = el.scrollLeft;       panInitTop  = el.scrollTop
      }
    }

    function onTouchMove(e) {
      if (touchMode === 'pinch' && e.touches.length === 2) {
        e.preventDefault()
        const newZoom = Math.min(3, Math.max(0.5, pinchStartZoom * getDist(e.touches) / pinchStartDist))
        useDocumentStore.getState().setZoomLevel(Math.round(newZoom * 10) / 10)
        return
      }
      if (touchMode === 'pan' && e.touches.length === 1) {
        e.preventDefault()
        el.scrollLeft = panInitLeft - (e.touches[0].clientX - panStartX)
        el.scrollTop  = panInitTop  - (e.touches[0].clientY - panStartY)
      }
    }

    function onTouchEnd() { touchMode = null }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])

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
    if (info && info.text.trim().length > 0) {
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
      containerEl, pageIndex,
      x0: e.clientX - r.left, y0: e.clientY - r.top,
      x1: e.clientX - r.left, y1: e.clientY - r.top,
    })
  }

  function handleRegionTouchStart(e, pageIndex, containerEl) {
    if (selectionMode !== 'region' || e.touches.length !== 1) return
    const touch = e.touches[0]
    const r = containerEl.getBoundingClientRect()
    setRegionDrag({
      containerEl, pageIndex,
      x0: touch.clientX - r.left, y0: touch.clientY - r.top,
      x1: touch.clientX - r.left, y1: touch.clientY - r.top,
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
    function onTouchMove(e) {
      e.preventDefault()
      const touch = e.touches[0]
      setRegionDrag((prev) => {
        if (!prev) return null
        const r = prev.containerEl.getBoundingClientRect()
        return { ...prev, x1: touch.clientX - r.left, y1: touch.clientY - r.top }
      })
    }

    function finishDrag(clientX, clientY) {
      setRegionDrag((prev) => {
        if (!prev) return null
        const { containerEl, pageIndex, x0, y0 } = prev
        const cr     = containerEl.getBoundingClientRect()
        const x1     = clientX - cr.left, y1 = clientY - cr.top
        const left   = Math.min(x0, x1) / cr.width
        const top    = Math.min(y0, y1) / cr.height
        const width  = Math.abs(x1 - x0) / cr.width
        const height = Math.abs(y1 - y0) / cr.height
        if (width > 0.01 && height > 0.01) {
          setActiveAnnotation(null)
          setAiState(null)
          setSelection({
            pageIndex, text: '[영역 선택]',
            rects: [{ top, left, width, height }],
            spanIndex: 0, startOffset: 0, endOffset: 0, isRegion: true,
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

    function onMouseUp(e) { finishDrag(e.clientX, e.clientY) }
    function onTouchEnd(e) { finishDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY) }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend',  onTouchEnd)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend',  onTouchEnd)
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
  // pageCanvas: react-pdf canvasRef로 직접 받은 HTMLCanvasElement
  // containerEl: 좌표 기준 컨테이너 (pageWrapper div)
  function captureRegionAsBase64(pageCanvas, containerEl, rects) {
    try {
      if (!pageCanvas || !containerEl || !rects?.length) return null
      const displayRect = containerEl.getBoundingClientRect()
      const rect = rects[0]
      // pageCanvas.width = 물리 픽셀, displayRect = CSS 픽셀
      const scaleX = pageCanvas.width  / displayRect.width
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
      return tmp.toDataURL('image/png').split(',')[1]
    } catch (err) {
      console.error('[captureRegionAsBase64] 캡처 실패:', err)
      return null
    }
  }

  function handleSendImageToChat() {
    if (!selection || !selection.isRegion) return
    const pageCanvas = viewMode === 'page'
      ? pageCanvasRef.current
      : scrollCanvasRefs.current[selection.pageIndex]
    const containerEl = viewMode === 'page'
      ? pageContainerRef.current
      : pageRefs.current[selection.pageIndex]
    const imageData = captureRegionAsBase64(pageCanvas, containerEl, selection.rects)
    if (!imageData) {
      setRegionError('이미지 캡처에 실패했습니다. 다시 시도해주세요.')
      setTimeout(() => setRegionError(null), 3000)
      return
    }
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

  function handleAnnotationClick(ann, pageIdx) {
    setSelection(null)
    setDragRects(null)
    setActiveAnnotation(ann)
    setActiveAnnotationPage(pageIdx ?? ann.pageIndex)
  }

  async function handleAITutor() {
    if (!selection) return
    const saved = selection
    setAiState({ selectionInfo: saved })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setDragRects(null)
    setPendingGroups([])
    reset()

    // RAG: 의미 검색 + 선택한 페이지 강제 포함
    const topChunks = await searchIndex(saved.text)
    const chunkMap = new Map(topChunks.map((c) => [c.pageIndex, c]))
    const selPageChunk = getChunkByPage(saved.pageIndex)
    if (selPageChunk && !chunkMap.has(selPageChunk.pageIndex)) {
      chunkMap.set(selPageChunk.pageIndex, selPageChunk)
    }
    const finalChunks = [...chunkMap.values()].sort((a, b) => a.pageIndex - b.pageIndex)

    const availablePages = finalChunks.map((c) => `p.${c.pageIndex + 1}`).join(', ')

    // ragBlock: 데이터만 (citation 규칙은 systemOverride로 분리)
    const ragBlock = finalChunks.length > 0
      ? `[문서 컨텍스트 — ${availablePages}]\n` +
        finalChunks.map((c) => `(p.${c.pageIndex + 1}) ${c.text}`).join('\n') +
        '\n---\n'
      : ''

    const systemOverride = finalChunks.length > 0
      ? buildRagSystemInstruction(availablePages)
      : NO_CHUNK_FALLBACK

    ask(saved.text, 'explain', ragBlock, systemOverride)
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
    touchAction: selectionMode === 'pan' ? 'none' : 'pan-x pan-y',
  }

  if (!pdfBlob) {
    return (
      <div style={styles.canvasWrapper}>
        <div style={styles.outer}>
          <div style={styles.loadingCenter}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>문서를 불러오는 중...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.canvasWrapper} ref={wrapperRef}>
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
          loading={<div style={styles.loadingCenter}><div style={styles.spinner} /><p style={styles.loadingText}>PDF 파싱 중...</p></div>}
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
                canvasRef={pageCanvasRef}
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
              {activeAnnotation && activeAnnotationPage === currentPage - 1 && (
                <AnnotationPopup
                  annotation={activeAnnotation}
                  displayPageIndex={activeAnnotationPage}
                  containerSize={containerSize}
                  onUpdate={updateAnnotation}
                  onDelete={(id) => { removeAnnotation(id); setActiveAnnotation(null); setActiveAnnotationPage(null) }}
                  onSendToChat={(ann) => { onSendToChat?.(ann); setActiveAnnotation(null); setActiveAnnotationPage(null) }}
                  onClose={() => { setActiveAnnotation(null); setActiveAnnotationPage(null) }}
                />
              )}
              {/* 영역 선택 오버레이 */}
              {selectionMode === 'region' && (
                <div
                  style={regionCaptureStyle}
                  onMouseDown={(e) => handleRegionMouseDown(e, currentPage - 1, pageContainerRef.current)}
                  onTouchStart={(e) => handleRegionTouchStart(e, currentPage - 1, pageContainerRef.current)}
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
                    canvasRef={(canvas) => {
                      if (canvas) scrollCanvasRefs.current[i] = canvas
                      else delete scrollCanvasRefs.current[i]
                    }}
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
                  {activeAnnotation && activeAnnotationPage === i && (
                    <AnnotationPopup
                      annotation={activeAnnotation}
                      displayPageIndex={activeAnnotationPage}
                      containerSize={containerSize}
                      onUpdate={updateAnnotation}
                      onDelete={(id) => { removeAnnotation(id); setActiveAnnotation(null); setActiveAnnotationPage(null) }}
                      onSendToChat={(ann) => { onSendToChat?.(ann); setActiveAnnotation(null); setActiveAnnotationPage(null) }}
                      onClose={() => { setActiveAnnotation(null); setActiveAnnotationPage(null) }}
                    />
                  )}
                  {selectionMode === 'region' && (
                    <div
                      style={regionCaptureStyle}
                      onMouseDown={(e) => handleRegionMouseDown(e, i, pageRefs.current[i])}
                      onTouchStart={(e) => handleRegionTouchStart(e, i, pageRefs.current[i])}
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

      {/* 영역 캡처 실패 알림 */}
      {regionError && (
        <div style={styles.regionErrorToast}>{regionError}</div>
      )}

      {/* 하단 플로팅 컨트롤 바 */}
      <div style={{ ...styles.bottomBar, transform: `translateX(-50%) scale(${Math.min(1, Math.max(0.65, wrapperWidth / 550))})` }}>
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

        {/* 색인 상태 배지 */}
        {indexing && (
          <span style={styles.indexBadge}>
            ⟳ {indexTotal > 0 ? `${indexProgress}/${indexTotal}` : '색인 중'}
          </span>
        )}
        {!indexing && indexed && (
          <span style={{ ...styles.indexBadge, background: 'rgba(92,204,127,0.25)', color: '#5CCC7F' }}>
            ✓ 색인
          </span>
        )}

        <span style={styles.barSpacer} />

        {SIDEBAR_TABS.map((tab) => {
          const isActive = sidebarOpen && activeTab === tab.key
          return (
            <button
              key={tab.key}
              title={tab.label}
              style={{
                ...styles.barBtn,
                ...(isActive ? styles.barBtnActive : {}),
                ...(!sidebarOpen ? { opacity: 0.4 } : {}),
              }}
              onClick={() => {
                if (sidebarOpen && activeTab === tab.key) {
                  onSidebarToggle?.()
                } else {
                  if (!sidebarOpen) onSidebarToggle?.()
                  onTabChange?.(tab.key)
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
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
  loadingCenter: {
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '3px solid #e0e0e0',
    borderTopColor: '#6366f1',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#aaa', fontSize: 13 },
  pageWrapper: {
    position: 'relative',
    display: 'inline-block',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
  regionErrorToast: {
    position: 'absolute',
    bottom: 72,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(200,0,0,0.88)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 16px',
    borderRadius: 20,
    pointerEvents: 'none',
    zIndex: 30,
    whiteSpace: 'nowrap',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    // transform은 인라인에서 동적으로 설정
    transformOrigin: 'center bottom',
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
    whiteSpace: 'nowrap',
    flexWrap: 'nowrap',
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
  indexBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 10,
    background: 'rgba(251,191,36,0.25)',
    color: '#FBBF24',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  barBtnDisabled: {
    opacity: 0.3,
    cursor: 'default',
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
