import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { extractSelection, mergeLineRects } from '../../lib/selectionUtils'
import useDocumentStore from '../../store/documentStore'
import useAnnotation from '../../hooks/useAnnotation'
import useAI from '../AI/useAI'
import useDocumentIndex from '../../hooks/useDocumentIndex'
import useLearningUnits from '../../hooks/useLearningUnits'
import useLearningQuestionAnswers, { getGateQuestions } from '../../hooks/useLearningQuestionAnswers'
import { buildLearningUnitsFromChunks, findUnitForPage } from '../../lib/learningUnits'
import { buildContextPackage, composePrompt } from '../../lib/ai/contextPipeline'
import HighlightLayer from './HighlightLayer'
import SelectionToolbar from './SelectionToolbar'
import SelectionActionPopup from './SelectionActionPopup'
import ContextMenu from './ContextMenu'
import AnnotationPopup from './AnnotationPopup'
import AIInlinePopup from './AIInlinePopup'
import LearningGoalOverlay from './LearningGoalOverlay'
import LearningQuestionPopup from './LearningQuestionPopup'

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
  { key: 'chat',    label: '💬 채팅' },
  { key: 'memo',    label: '📝 메모' },
  { key: 'mindmap', label: '🧠 마인드맵' },
  { key: 'quiz',    label: '🧩 퀴즈' },
]

export default function DocumentCanvas({
  docId,
  onSendToChat,
  onCreateQuiz,
  activeTab,
  onTabChange,
  sidebarOpen,
  sidebarWidth = 0,
  isMobile = false,
  onSidebarToggle,
  onShowSuggestedQuestions,
  questionPromptRequest,
  onQuestionPromptHandled,
  questionGateEnabled = true,
  onToggleQuestionGate,
}) {
  const { pdfBlob, currentPage, numPages, zoomLevel, viewMode, selectionMode, setNumPages, setCurrentPage, setZoomLevel, setViewMode, setSelectionMode } =
    useDocumentStore()

  const { annotations, add: addAnnotation, update: updateAnnotation, remove: removeAnnotation, undoLast } =
    useAnnotation(docId)

  const { ask, response, isStreaming, reset } = useAI()
  const { search: searchIndex, getChunkByPage, getAllChunks, indexing, indexed, indexProgress, indexTotal, chunkCount } = useDocumentIndex(docId)
  const {
    getUnitForPage,
    ensureUnitForPage,
    prefetchUnitsAroundPage,
    toggleUnitComplete,
    regenerateUnit,
    generatingByUnit,
    errorsByUnit,
  } = useLearningUnits(docId)
  const { unresolvedQuestions } = useLearningQuestionAnswers(docId)

  const pdfFile = useMemo(() => pdfBlob ?? null, [pdfBlob])
  const currentPageIndex = Math.max(0, currentPage - 1)
  const allChunks = useMemo(() => indexed ? getAllChunks() : [], [indexed, chunkCount, getAllChunks])
  const candidateUnits = useMemo(() => buildLearningUnitsFromChunks(allChunks), [allChunks])
  const currentCandidateUnit = findUnitForPage(candidateUnits, currentPageIndex)
  const currentUnit = getUnitForPage(currentPageIndex)
  const currentUnitId = currentUnit?.id ?? currentCandidateUnit?.id ?? null
  const currentGoalLoading = currentUnitId ? !!generatingByUnit[currentUnitId] : false
  const currentGoalError = currentUnitId ? errorsByUnit[currentUnitId] : null
  const currentGoalUnavailable = indexed && !indexing && !currentCandidateUnit && !currentUnit
  const currentPageHint = currentUnit?.pageHints?.[String(currentPageIndex)] ?? currentUnit?.pageHints?.[currentPageIndex]
  const currentPageRange = currentUnit || currentCandidateUnit
    ? `${(currentUnit ?? currentCandidateUnit).startPageIndex + 1}-${(currentUnit ?? currentCandidateUnit).endPageIndex + 1}p`
    : `${currentPage}p`
  const currentGateQuestions = getGateQuestions(currentUnit, currentPageIndex)
  const activeBlockingUnit = currentGateQuestions.length ? currentUnit : null
  const isUnitLastPage = currentGateQuestions.length > 0 && currentPageIndex === currentUnit.endPageIndex

  const [selection, setSelection]               = useState(null)
  const [memoToolbarOpen, setMemoToolbarOpen]   = useState(false)
  const [dragRects, setDragRects]               = useState(null)
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [activeAnnotationPage, setActiveAnnotationPage] = useState(null)
  const [containerSize, setContainerSize]       = useState(null)
  const [aiState, setAiState]                   = useState(null)
  const [regionError, setRegionError]           = useState(null)
  const [contextMenu, setContextMenu]           = useState(null)
  const [blockedPageTarget, setBlockedPageTarget] = useState(null)
  const [questionPopupMode, setQuestionPopupMode] = useState(null)
  const [dismissedUnitLastPageId, setDismissedUnitLastPageId] = useState(null)
  // 硫???쒕옒洹??꾩쟻 洹몃９
  const [pendingGroups, setPendingGroups]       = useState([])
  const [wrapperWidth, setWrapperWidth]         = useState(800)

  const pageContainerRef = useRef(null)
  const firstScrollRef   = useRef(null)
  const pageRefs         = useRef({})
  const pageCanvasRef    = useRef(null)   // page 紐⑤뱶 PDF 罹붾쾭??吏곸젒 李몄“
  const scrollCanvasRefs = useRef({})     // scroll 紐⑤뱶 PDF 罹붾쾭??吏곸젒 李몄“
  const outerRef         = useRef(null)  // ?ㅽ겕濡?而⑦뀒?대꼫 (pan mode??
  const wrapperRef       = useRef(null)  // canvasWrapper ?덈퉬 痢≪젙??
  const navDebounceRef   = useRef(null)  // 諛⑺뼢???섏씠吏 ?대룞 debounce ??대㉧
  const targetPageRef    = useRef(null)  // debounce 以?紐⑺몴 ?섏씠吏
  const mobileAutoFitZoomRef = useRef(null)

  // ?곸뿭 ?좏깮 ?쒕옒洹??곹깭
  const [regionDrag, setRegionDrag] = useState(null)

  // ?섏씠吏?믪뒪?щ· ?꾪솚 ???꾩튂 ?좎???
  const prevViewModeRef   = useRef(viewMode)
  const scrollToPageRef   = useRef(currentPage)

  useEffect(() => {
    scrollToPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    mobileAutoFitZoomRef.current = null
  }, [docId, isMobile])

  useEffect(() => {
    if (!indexed || allChunks.length === 0) return
    ensureUnitForPage(currentPageIndex, allChunks)
  }, [indexed, allChunks, currentPageIndex, ensureUnitForPage])

  useEffect(() => {
    if (!indexed || allChunks.length === 0) return
    prefetchUnitsAroundPage(currentPageIndex, allChunks)
  }, [indexed, allChunks, currentPageIndex, prefetchUnitsAroundPage])

  useEffect(() => {
    if (!questionPromptRequest?.id) return
    if (!questionGateEnabled) {
      setBlockedPageTarget(null)
      setQuestionPopupMode(null)
      onQuestionPromptHandled?.(questionPromptRequest.id)
      return
    }
    setBlockedPageTarget({
      page: questionPromptRequest.page,
      reason: questionPromptRequest.reason ?? 'external',
    })
    setQuestionPopupMode('blocked')
    onQuestionPromptHandled?.(questionPromptRequest.id)
  }, [questionPromptRequest?.id, questionPromptRequest?.page, questionPromptRequest?.reason, questionGateEnabled, onQuestionPromptHandled])

  useEffect(() => {
    if (questionGateEnabled) return
    setBlockedPageTarget(null)
    setQuestionPopupMode(null)
  }, [questionGateEnabled])

  useEffect(() => {
    if (!questionGateEnabled) return
    if (!isUnitLastPage || !currentUnit?.id) return
    if (dismissedUnitLastPageId === currentUnit.id) return
    if (unresolvedQuestions(currentUnit, currentPageIndex).length === 0) return
    setQuestionPopupMode('review')
  }, [questionGateEnabled, isUnitLastPage, currentUnit, currentPageIndex, dismissedUnitLastPageId, unresolvedQuestions])

  // ?섏씠吏 ?꾪솚 ??AI ?몃씪???앹뾽 珥덇린??  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (aiState) { setAiState(null); reset() } }, [currentPage])

  // ?? ?섏씠吏?믪뒪?щ· ?꾪솚 ???꾩옱 ?섏씠吏濡??ㅽ겕濡????????????????
  useEffect(() => {
    if (viewMode === 'scroll' && prevViewModeRef.current === 'page') {
      const pageIdx = scrollToPageRef.current - 1
      // ?ㅽ겕濡?紐⑤뱶濡??뚮뜑 ?꾨즺 ???대룞
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = pageRefs.current[pageIdx]
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
        })
      })
    }
    prevViewModeRef.current = viewMode
  }, [viewMode])

  useEffect(() => {
    if (viewMode !== 'scroll') return
    const root = outerRef.current
    if (!root) return

    let frame = null
    function updateCurrentPageFromScroll() {
      frame = null
      const rootRect = root.getBoundingClientRect()
      const centerY = rootRect.top + rootRect.height / 2
      let best = null

      for (const [idx, el] of Object.entries(pageRefs.current)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.bottom < rootRect.top || rect.top > rootRect.bottom) continue
        const pageCenterY = rect.top + rect.height / 2
        const distance = Math.abs(pageCenterY - centerY)
        if (!best || distance < best.distance) {
          best = { pageIndex: Number(idx), distance }
        }
      }

      if (best && best.pageIndex + 1 !== scrollToPageRef.current) {
        const moved = requestPageChange(best.pageIndex + 1, { reason: 'scroll' })
        if (!moved) return
      }
    }

    function scheduleUpdate() {
      if (frame != null) return
      frame = requestAnimationFrame(updateCurrentPageFromScroll)
    }

    root.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    scheduleUpdate()

    return () => {
      root.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame != null) cancelAnimationFrame(frame)
    }
  }, [viewMode, numPages, zoomLevel, setCurrentPage, currentPage, activeBlockingUnit, questionGateEnabled, unresolvedQuestions])

  // ?? canvasWrapper ?덈퉬 媛먯? (?섎떒 諛??ㅼ??쇱슜) ???????????????
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWrapperWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ?? ?ㅻ낫??諛⑺뼢?? ?섏씠吏 ?꾪솚 + Shift+Arrow ?좏깮 ?곸뿭 ?뺤옣/異뺤냼 ??
  useEffect(() => {
    function handleKeyDown(e) {
      const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      const key = e.key || e.code
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isTextInput = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTextInput) {
        e.preventDefault()
        undoLast?.()
        return
      }

      if (e.key === 'Escape') {
        if (selection || dragRects || pendingGroups.length > 0 || activeAnnotation || aiState || contextMenu) {
          e.preventDefault()
          setContextMenu(null)
          handleSelectionClose()
          setActiveAnnotation(null)
          setActiveAnnotationPage(null)
          if (aiState) {
            setAiState(null)
            reset()
          }
        }
        return
      }
      // Shift+Arrow: 釉뚮씪?곗? ?쒖?泥섎읆 ?좏깮 ?앹젏 ?뺤옣/異뺤냼
      if (e.shiftKey && selection && ARROW_KEYS.includes(key)) {
        e.preventDefault()
        const domSel = window.getSelection()
        if (!domSel || domSel.rangeCount === 0) return

        const direction  = (key === 'ArrowRight' || key === 'ArrowDown') ? 'forward' : 'backward'
        const granularity = (key === 'ArrowLeft'  || key === 'ArrowRight') ? 'character' : 'line'
        domSel.modify('extend', direction, granularity)

        // DOM ?좏깮 蹂寃???selection ?ъ텛異?        let container    = null
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
          if (info) {
            setSelection(info)
            setMemoToolbarOpen(false)
          } else {
            setSelection(null)
            setMemoToolbarOpen(false)
            setDragRects(null)
          }
        }
        return
      }
      // page 紐⑤뱶 諛⑺뼢???꾪솚 (shift ?놁쓣 ??
      if (viewMode !== 'page' || e.shiftKey) return
      if (isTextInput) return
      if (key === 'ArrowLeft' || key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const next = Math.max(1, (targetPageRef.current ?? currentPage) - 1)
        targetPageRef.current = next
        clearTimeout(navDebounceRef.current)
        navDebounceRef.current = setTimeout(() => {
          requestPageChange(targetPageRef.current, { reason: 'keyboard' })
          targetPageRef.current = null
        }, 120)
      } else if (key === 'ArrowRight' || key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        const next = Math.min(numPages, (targetPageRef.current ?? currentPage) + 1)
        targetPageRef.current = next
        clearTimeout(navDebounceRef.current)
        navDebounceRef.current = setTimeout(() => {
          requestPageChange(targetPageRef.current, { reason: 'keyboard' })
          targetPageRef.current = null
        }, 120)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [viewMode, currentPage, numPages, setCurrentPage, selection, dragRects, pendingGroups.length, activeAnnotation, aiState, contextMenu, undoLast, reset, questionGateEnabled, activeBlockingUnit, unresolvedQuestions])

  // ?? ?곗튂 ??+ ?移?以?????????????????????????????????????????
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

  function fitMobilePageToViewport(el) {
    if (!isMobile || !el || !wrapperWidth) return
    if (mobileAutoFitZoomRef.current != null && Math.abs(zoomLevel - mobileAutoFitZoomRef.current) > 0.02) return

    const { width } = el.getBoundingClientRect()
    const viewportWidth = Math.min(wrapperWidth, window.innerWidth || wrapperWidth)
    const targetWidth = Math.max(280, viewportWidth - 48)
    if (width <= targetWidth + 8) return

    const nextZoom = Math.max(0.3, Math.min(1, Math.floor((zoomLevel * targetWidth / width) * 100) / 100))
    if (Math.abs(nextZoom - zoomLevel) < 0.02) return
    mobileAutoFitZoomRef.current = nextZoom
    setZoomLevel(nextZoom)
  }

  function handlePageRenderSuccess() {
    measureContainer(pageContainerRef.current)
    fitMobilePageToViewport(pageContainerRef.current)
  }

  function handleFirstScrollRenderSuccess() {
    measureContainer(firstScrollRef.current)
    fitMobilePageToViewport(firstScrollRef.current)
  }

  useEffect(() => {
    if (!isMobile) return
    const el = viewMode === 'page' ? pageContainerRef.current : firstScrollRef.current
    fitMobilePageToViewport(el)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, wrapperWidth, viewMode, currentPage])

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

  // ?? ?ㅽ겕濡?紐⑤뱶?먯꽌 ?щ컮瑜??섏씠吏 而⑦뀒?대꼫 李얘린 ???????????????
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
      // removeAllRanges ?섏? ?딆쓬 ???ъ슜?먭? Ctrl+C濡?蹂듭궗 媛??      setActiveAnnotation(null)
      setAiState(null)
      setSelection(info)
      setMemoToolbarOpen(false)
    } else {
      setDragRects(null)
    }
  }, [currentPage, viewMode, selectionMode])

  // ?몃━???대┃ ???대떦 以??꾩껜 ?좏깮
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

  // ?섏씠吏 ?꾩껜 ?띿뒪???좏깮
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

  function getUnitIdForPage(pageIndex) {
    const unit = getUnitForPage(pageIndex) ?? findUnitForPage(candidateUnits, pageIndex)
    return unit?.id ?? (unit ? `unit_${unit.startPageIndex}_${unit.endPageIndex}` : null)
  }

  function requestPageChange(nextPage, options = {}) {
    const clampedPage = Math.min(numPages, Math.max(1, nextPage))
    if (!clampedPage || clampedPage === currentPage) return true
    if (clampedPage < currentPage) {
      setBlockedPageTarget(null)
      setCurrentPage(clampedPage)
      if (options.viewMode) setViewMode(options.viewMode)
      return true
    }
    if (!questionGateEnabled) {
      setBlockedPageTarget(null)
      setCurrentPage(clampedPage)
      if (options.viewMode) setViewMode(options.viewMode)
      return true
    }

    const currentUnitId = activeBlockingUnit?.id ?? null
    const targetUnitId = getUnitIdForPage(clampedPage - 1)
    const pending = activeBlockingUnit ? unresolvedQuestions(activeBlockingUnit, currentPageIndex) : []
    const shouldBlock = pending.length > 0 && currentUnitId && targetUnitId !== currentUnitId

    if (shouldBlock) {
      setBlockedPageTarget({ page: clampedPage, reason: options.reason ?? 'page' })
      setQuestionPopupMode('blocked')
      return false
    }

    setBlockedPageTarget(null)
    setCurrentPage(clampedPage)
    if (options.viewMode) setViewMode(options.viewMode)
    return true
  }

  function closeQuestionPopup() {
    if (questionPopupMode === 'review' && currentUnit?.id) {
      setDismissedUnitLastPageId(currentUnit.id)
    }
    setQuestionPopupMode(null)
  }

  function moveAfterQuestionsResolved() {
    if (!blockedPageTarget?.page) return
    const page = blockedPageTarget.page
    const shouldStayInScroll = viewMode === 'scroll'
    setBlockedPageTarget(null)
    setQuestionPopupMode(null)
    setCurrentPage(page)
    if (shouldStayInScroll) {
      requestAnimationFrame(() => {
        const el = pageRefs.current[page - 1]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    setViewMode('page')
  }

  function askQuestionInChat(prompt) {
    onShowSuggestedQuestions?.()
    onSendToChat?.({
      id: `thinking-question:${Date.now()}`,
      transient: true,
      type: 'thinking-question',
      text: '?ш퀬 吏덈Ц',
      content: prompt,
      pageIndex: currentPageIndex,
      autoPrompt: prompt,
    })
    closeQuestionPopup()
  }

  // ?? Pan 紐⑤뱶 ?쒕옒洹??ㅽ겕濡?????????????????????????????????????
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

  // ?? ?곸뿭 ?좏깮 ?몃뱾????????????????????????????????????????????
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
            pageIndex, text: '[?곸뿭 ?좏깮]',
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

  // ?됱긽 ?좏깮 ?꾨즺 ???⑥씪 ?먮뒗 硫???쒕옒洹?annotation ???
  function handleSelectionSave(color, content) {
    if (!selection) return
    const groups = [...pendingGroups, selection]
    addAnnotation(groups, color, content)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setMemoToolbarOpen(false)
    setPendingGroups([])
  }

  // "異붽? ?좏깮" ???꾩옱 selection??pending???볤퀬 toolbar ?リ린
  function handleAddSelection() {
    if (!selection) return
    window.getSelection()?.removeAllRanges()
    setPendingGroups((prev) => [...prev, selection])
    setSelection(null)
    setMemoToolbarOpen(false)
    setDragRects(null)
  }

  // ?꾩쟻 珥덇린??
  function handleClearPending() {
    setPendingGroups([])
  }

  // ?꾩쟻 ??ぉ 媛쒕퀎 ?쒓굅
  function handleRemovePending(index) {
    setPendingGroups((prev) => prev.filter((_, i) => i !== index))
  }

  // ?뚰봽???リ린: toolbar留??レ쓬, pendingGroups 蹂댁〈 (?몃? ?대┃, ?섏씠吏 ?대룞 ??
  function handleSoftClose() {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setMemoToolbarOpen(false)
    setDragRects(null)
  }

  // 紐낆떆??痍⑥냼: pendingGroups源뚯? 珥덇린??(痍⑥냼 踰꾪듉, 紐⑤몢 吏?곌린)
  function handleSelectionClose() {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setMemoToolbarOpen(false)
    setDragRects(null)
    setPendingGroups([])
  }

  function buildSelectionContext() {
    if (!selection) return null
    const groups = [...pendingGroups, selection]
    const first = groups[0]
    const text = groups.map((g) => g.text).filter(Boolean).join(' / ')

    return {
      id: `selection_${Date.now()}`,
      docId,
      pageIndex: first.pageIndex,
      text,
      color: 'blue',
      content: '',
      type: 'selection',
      rects: first.rects ?? [],
      rectGroups: groups.length > 1
        ? groups.map((g) => ({
            pageIndex: g.pageIndex,
            rects: g.rects ?? [],
            text: g.text,
          }))
        : undefined,
      transient: true,
      createdAt: new Date().toISOString(),
    }
  }

  function handleSendSelectionToChat() {
    const context = buildSelectionContext()
    if (!context) return
    onSendToChat?.(context)
    handleSelectionClose()
  }

  function handleCreateQuizFromSelection() {
    const context = buildSelectionContext()
    if (!context) return
    onCreateQuiz?.({
      scope: 'selection',
      title: '선택 텍스트',
      pageIndex: context.pageIndex,
      text: context.text,
    })
    handleSelectionClose()
  }

  function handleCreateQuizFromPage(pageIndex = currentPage - 1) {
    onCreateQuiz?.({
      scope: 'page',
      title: `${pageIndex + 1}p`,
      pageIndex,
    })
  }

  function handleSummarizePage(pageIndex = currentPage - 1) {
    const chunk = getChunkByPage(pageIndex)
    const pageText = chunk?.text?.trim()
    onSendToChat?.({
      id: `page_summary_${pageIndex}_${Date.now()}`,
      docId,
      pageIndex,
      text: pageText || `${pageIndex + 1}p`,
      color: 'blue',
      content: '?꾩옱 ?섏씠吏瑜??듭떖 媛쒕뀗 以묒떖?쇰줈 ?붿빟?댁쨾.',
      type: 'page-summary',
      transient: true,
      autoPrompt: '?꾩옱 ?섏씠吏瑜??듭떖 媛쒕뀗, 以묒슂???⑹뼱, ?쒗뿕???섏삱 留뚰븳 ?ъ씤??以묒떖?쇰줈 ?붿빟?댁쨾.',
      createdAt: new Date().toISOString(),
    })
  }

  function handleContextMenu(e, pageIndex = currentPage - 1) {
    if (selectionMode === 'region') return
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      pageIndex,
      mode: selection ? 'selection' : 'page',
    })
  }

  function handleOuterPointerDown(e) {
    if (e.target === outerRef.current && (selection || dragRects || pendingGroups.length > 0)) {
      handleSelectionClose()
    }
  }

  // ?? ?곸뿭 ?좏깮 ?대?吏 罹≪쿂 (pdf.js 罹붾쾭???щ∼) ???????????????
  // pageCanvas: react-pdf canvasRef濡?吏곸젒 諛쏆? HTMLCanvasElement
  // containerEl: 醫뚰몴 湲곗? 而⑦뀒?대꼫 (pageWrapper div)
  function captureRegionAsBase64(pageCanvas, containerEl, rects) {
    try {
      if (!pageCanvas || !containerEl || !rects?.length) return null
      const displayRect = containerEl.getBoundingClientRect()
      const rect = rects[0]
      // pageCanvas.width = 臾쇰━ ?쎌?, displayRect = CSS ?쎌?
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
      console.error('[captureRegionAsBase64] 罹≪쿂 ?ㅽ뙣:', err)
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
      setRegionError('?대?吏 罹≪쿂???ㅽ뙣?덉뒿?덈떎. ?ㅼ떆 ?쒕룄?댁＜?몄슂.')
      setTimeout(() => setRegionError(null), 3000)
      return
    }
    onSendToChat?.({
      id:        `region_${Date.now()}`,
      type:      'region',
      text:      '[?곸뿭 ?좏깮]',
      color:     'blue',
      pageIndex: selection.pageIndex,
      content:   '',
      imageData,
    })
    handleSoftClose()
  }

  function handleAnnotationClick(ann, pageIdx) {
    setSelection(null)
    setMemoToolbarOpen(false)
    setDragRects(null)
    setActiveAnnotation(ann)
    setActiveAnnotationPage(pageIdx ?? ann.pageIndex)
  }

  function handleAnnotationContextMenu(e, ann, pageIdx) {
    setSelection(null)
    setMemoToolbarOpen(false)
    setDragRects(null)
    setActiveAnnotation(null)
    setActiveAnnotationPage(null)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      pageIndex: pageIdx ?? ann.pageIndex,
      mode: 'annotation',
      annotation: ann,
    })
  }

  async function handleAITutor() {
    if (!selection) return
    const saved = selection
    setAiState({ selectionInfo: saved })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setMemoToolbarOpen(false)
    setDragRects(null)
    setPendingGroups([])
    reset()

    const topChunks = await searchIndex(saved.text)
    const selectionContext = [{ ...saved, type: 'text' }]
    const contextPackage = buildContextPackage({
      userText: saved.text,
      intent: 'quick_explain',
      semanticChunks: topChunks,
      selectedContexts: selectionContext,
      currentPageChunk: getChunkByPage(saved.pageIndex),
      getChunkByPage,
    })
    const { ragBlock, systemInstruction: systemOverride } = composePrompt({
      userText: saved.text,
      selectedContexts: selectionContext,
      contextPackage,
    })

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

  // pending ?ㅻ쾭?덉씠: 媛?洹몃９??rects瑜??꾩옱 ?섏씠吏?먯꽌 ?쒖떆
  const pendingOverlayRects = pendingGroups
    .filter((g) => g.pageIndex === currentPage - 1)
    .flatMap((g) => g.rects)
  const rightPageNavOffset = 12
  const pageNavHidden = sidebarOpen && isMobile
  const canvasWrapperStyle = {
    ...styles.canvasWrapper,
    marginRight: sidebarOpen && !isMobile ? sidebarWidth : 0,
  }

  // pan 紐⑤뱶 outer ?ㅽ???
  const outerStyle = {
    ...styles.outer,
    ...(isMobile ? styles.outerMobile : {}),
    cursor: selectionMode === 'pan' ? 'grab' : undefined,
    userSelect: selectionMode === 'pan' ? 'none' : undefined,
    touchAction: selectionMode === 'pan' ? 'none' : 'pan-x pan-y',
  }
  const leftRailStyle = {
    ...styles.leftRail,
    ...(isMobile ? styles.leftRailMobile : {}),
  }
  const bottomDockStyle = {
    ...styles.bottomDock,
    ...(isMobile ? styles.bottomDockMobile : {}),
  }
  if (!pdfBlob) {
    return (
      <div style={styles.canvasWrapper}>
        <div style={styles.outer}>
          <div style={styles.loadingCenter}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>臾몄꽌瑜?遺덈윭?ㅻ뒗 以?..</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={canvasWrapperStyle} ref={wrapperRef}>
      <LearningGoalOverlay
        goal={currentUnit}
        loading={currentGoalLoading}
        error={currentGoalError}
        indexing={indexing}
        indexProgress={indexProgress}
        indexTotal={indexTotal}
        unavailable={currentGoalUnavailable}
        pageNumber={currentPage}
        pageRange={currentPageRange}
        pageHint={currentPageHint}
        onToggleComplete={() => toggleUnitComplete(currentUnit?.id)}
        onRegenerate={() => regenerateUnit(currentUnit?.id, allChunks)}
      />

      <div
        ref={outerRef}
        style={outerStyle}
        onMouseUp={handleMouseUp}
        onMouseDown={handlePanMouseDown}
        onPointerDown={handleOuterPointerDown}
      >
        <Document
          file={pdfFile}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(err) => console.error('PDF load error:', err)}
          loading={<div style={styles.loadingCenter}><div style={styles.spinner} /><p style={styles.loadingText}>PDF ?뚯떛 以?..</p></div>}
        >
          {viewMode === 'page' ? (
            <div
              style={styles.pageWrapper}
              ref={pageContainerRef}
              onClick={(e) => handleTripleClick(e, currentPage - 1, pageContainerRef.current)}
              onContextMenu={(e) => handleContextMenu(e, currentPage - 1)}
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
                onContextMenuAnnotation={handleAnnotationContextMenu}
              />
              {/* 硫???쒕옒洹??꾩쟻 ?ㅻ쾭?덉씠 */}
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
              {/* ?곸뿭 ?좏깮 ?ㅻ쾭?덉씠 */}
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
                  onContextMenu={(e) => handleContextMenu(e, i)}
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
                    onContextMenuAnnotation={handleAnnotationContextMenu}
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

      {/* ?????섏씠吏 ?대룞 踰꾪듉 */}
      {viewMode === 'page' && numPages > 0 && !pageNavHidden && (
        <>
          <button
            style={{ ...styles.pageNavBtn, left: isMobile ? 12 : 62, opacity: currentPage <= 1 ? 0.25 : 0.65 }}
            onClick={() => requestPageChange(currentPage - 1, { reason: 'button' })}
            disabled={currentPage <= 1}
          >
            ‹
          </button>
          <button
            style={{ ...styles.pageNavBtn, right: rightPageNavOffset, opacity: currentPage >= numPages ? 0.25 : 0.65 }}
            onClick={() => requestPageChange(currentPage + 1, { reason: 'button' })}
            disabled={currentPage >= numPages}
          >
            ›
          </button>
        </>
      )}

      {/* ?곸뿭 罹≪쿂 ?ㅽ뙣 ?뚮┝ */}
      {questionGateEnabled && questionPopupMode && activeBlockingUnit && (
        <LearningQuestionPopup
          docId={docId}
          unit={activeBlockingUnit}
          pageIndex={currentPageIndex}
          targetPage={questionPopupMode === 'blocked' ? blockedPageTarget?.page : null}
          mode={questionPopupMode}
          questionGateEnabled={questionGateEnabled}
          onClose={closeQuestionPopup}
          onTurnOffGate={() => {
            setBlockedPageTarget(null)
            setQuestionPopupMode(null)
            onToggleQuestionGate?.()
          }}
          onMoveAfterResolved={moveAfterQuestionsResolved}
          onAskChat={askQuestionInChat}
        />
      )}

      {regionError && (
        <div style={styles.regionErrorToast}>{regionError}</div>
      )}

      <div style={leftRailStyle}>
        <button
          title="텍스트 선택"
          style={{ ...styles.railBtn, ...(selectionMode === 'text' ? styles.railBtnActive : {}), fontWeight: 700 }}
          onClick={() => setSelectionMode('text')}
        >
          T
        </button>
        <button
          title="영역 선택"
          style={{ ...styles.railBtn, ...(selectionMode === 'region' ? styles.railBtnActive : {}) }}
          onClick={() => setSelectionMode('region')}
        >
          ⌗
        </button>
        <button
          title="손 도구"
          style={{ ...styles.railBtn, ...(selectionMode === 'pan' ? styles.railBtnActive : {}) }}
          onClick={() => setSelectionMode('pan')}
        >
          ☝
        </button>

        {selectionMode === 'text' && viewMode === 'page' && !isMobile && (
          <button
            title="현재 페이지 텍스트 전체 선택"
            style={{ ...styles.railBtn, ...styles.railBtnSmall }}
            onClick={handleSelectAll}
          >
            전체
          </button>
        )}
      </div>

      {indexing && (
        <div style={{ ...styles.indexBadge, ...(isMobile ? styles.indexBadgeMobile : {}) }}>
          {indexTotal > 0 ? `색인 ${indexProgress}/${indexTotal}` : '색인 중'}
        </div>
      )}

      <div style={bottomDockStyle}>
        {SIDEBAR_TABS.map((tab) => {
          const isActive = sidebarOpen && activeTab === tab.key
          return (
            <button
              key={tab.key}
              title={tab.label}
              style={{
                ...styles.dockBtn,
                ...(isMobile ? styles.dockBtnMobile : {}),
                ...(isActive ? styles.dockBtnActive : {}),
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

      {selection && !memoToolbarOpen && (
        <SelectionActionPopup
          viewportRect={selection.viewportRect}
          isRegion={!!selection.isRegion}
          onMemo={() => setMemoToolbarOpen(true)}
          onSendToChat={selection.isRegion ? handleSendImageToChat : handleSendSelectionToChat}
          onAITutor={handleAITutor}
          onCreateQuiz={handleCreateQuizFromSelection}
          onCancel={handleSoftClose}
          onCancelAll={handleSelectionClose}
          onAddSelection={handleAddSelection}
          pendingCount={pendingGroups.length}
        />
      )}

      {selection && memoToolbarOpen && (
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
          onSendSelectionToChat={handleSendSelectionToChat}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          mode={contextMenu.mode}
          annotation={contextMenu.annotation}
          onClose={() => setContextMenu(null)}
          onMemo={() => setMemoToolbarOpen(true)}
          onSendToChat={contextMenu.mode === 'annotation' ? (ann) => onSendToChat?.(ann) : handleSendSelectionToChat}
          onAddSelection={handleAddSelection}
          onCreateQuiz={contextMenu.mode === 'selection'
            ? handleCreateQuizFromSelection
            : () => handleCreateQuizFromPage(contextMenu.pageIndex)}
          onSummarizePage={() => handleSummarizePage(contextMenu.pageIndex)}
          onShowMemos={() => onTabChange?.('memo')}
          onCancelSelection={handleSelectionClose}
          onEditAnnotation={(ann) => {
            setActiveAnnotation(ann)
            setActiveAnnotationPage(contextMenu.pageIndex ?? ann.pageIndex)
          }}
          onDeleteAnnotation={(ann) => {
            if (ann?.id) removeAnnotation(ann.id)
          }}
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
    flexDirection: 'column',
  },
  outer: {
    flex: 1,
    overflow: 'auto',
    background: '#f1f1f7',
    display: 'block',
    padding: '84px 28px 96px',
  },
  outerMobile: {
    padding: '78px 12px 92px',
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
    borderTopColor: '#070761',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#aaa', fontSize: 13 },
  pageWrapper: {
    position: 'relative',
    display: 'block',
    width: 'fit-content',
    margin: '0 auto',
    background: '#ffffff',
    boxShadow: '0 16px 46px rgba(7,7,97,0.13)',
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
  blockNotice: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 35,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: 'calc(100% - 32px)',
    padding: '9px 12px',
    borderRadius: 9,
    background: '#fff',
    border: '1px solid #f59e0b',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
    color: '#111827',
    fontSize: 12,
  },
  blockNoticeMobile: {
    top: 10,
    left: 12,
    right: 12,
    transform: 'none',
    alignItems: 'flex-start',
    maxWidth: 'none',
    padding: '10px 36px 10px 10px',
  },
  blockCloseBtn: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 22,
    height: 22,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: '#6b7280',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    lineHeight: '22px',
  },
  blockNoticeText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    lineHeight: 1.45,
  },
  gateToggleBtn: {
    borderRadius: 7,
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    color: '#9a3412',
    padding: '7px 9px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  blockNoticeBtn: {
    border: 'none',
    borderRadius: 7,
    background: '#111827',
    color: '#fff',
    padding: '6px 9px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    flexShrink: 0,
  },
  leftRail: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    width: 50,
    padding: '20px 0',
    background: '#ffffff',
    borderRight: '1px solid #efeff6',
    boxShadow: '4px 0 18px rgba(7,7,97,0.04)',
    userSelect: 'none',
  },
  leftRailMobile: {
    width: 42,
    padding: '14px 0',
    gap: 8,
  },
  railBtn: {
    width: 34,
    height: 34,
    padding: 0,
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 800,
    color: '#111111',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    lineHeight: 1.3,
    transition: 'background 0.12s, color 0.12s',
  },
  railBtnSmall: {
    fontSize: 10,
    color: '#070761',
    background: '#eeeef8',
  },
  railBtnActive: {
    background: '#f0f0fb',
    color: '#070761',
    fontWeight: 900,
  },
  bottomDock: {
    position: 'absolute',
    left: '50%',
    bottom: 22,
    transform: 'translateX(-50%)',
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px',
    borderRadius: 28,
    background: '#bcbcd8',
    boxShadow: '0 10px 24px rgba(7,7,97,0.12)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  bottomDockMobile: {
    bottom: 12,
    maxWidth: 'calc(100% - 24px)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    gap: 2,
  },
  dockBtn: {
    minWidth: 92,
    minHeight: 36,
    padding: '8px 15px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 850,
    color: '#070761',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    lineHeight: 1.2,
    transition: 'background 0.12s, color 0.12s',
  },
  dockBtnActive: {
    background: '#070761',
    color: '#ffffff',
    fontWeight: 900,
  },
  dockBtnMobile: {
    minWidth: 82,
    padding: '8px 8px',
    fontSize: 12,
  },
  barDivider: {
    width: 1,
    height: 16,
    background: '#d7d7e8',
    margin: '0 4px',
    flexShrink: 0,
  },
  barSpacer: {
    flex: 1,
    minWidth: 16,
  },
  barSpacerMobile: {
    display: 'none',
  },
  indexBadge: {
    position: 'absolute',
    left: 62,
    bottom: 30,
    zIndex: 31,
    fontSize: 10,
    fontWeight: 900,
    padding: '3px 8px',
    borderRadius: 10,
    background: '#eeeef8',
    color: '#070761',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  indexBadgeDone: {
    background: 'rgba(92,204,127,0.25)',
    color: '#278348',
  },
  indexBadgeMobile: {
    display: 'none',
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
    background: 'rgba(255,255,255,0.95)',
    color: '#070761',
    fontSize: 24,
    cursor: 'pointer',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(7,7,97,0.1)',
    lineHeight: 1,
    transition: 'opacity 0.15s',
  },
}
