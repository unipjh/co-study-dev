import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getBlob } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import useDocumentStore from '../store/documentStore'
import useAuthStore from '../store/authStore'
import TopToolbar from '../components/Toolbar/TopToolbar'
import DocumentCanvas from '../components/Canvas/DocumentCanvas'
import PageThumbnailPanel from '../components/Canvas/PageThumbnailPanel'
import SidePanel from '../components/Sidebar/SidePanel'
import useAnnotation from '../hooks/useAnnotation'
import useLearningUnits from '../hooks/useLearningUnits'
import useLearningQuestionAnswers from '../hooks/useLearningQuestionAnswers'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 300

export default function ViewerPage() {
  const { docId }    = useParams()
  const navigate     = useNavigate()
  const { setStorageDoc, pdfBlob, numPages, currentPage, setCurrentPage } = useDocumentStore()
  const uid = useAuthStore((s) => s.user?.uid)

  const [sidebarOpen,        setSidebarOpen]        = useState(() => window.innerWidth >= 700)
  const [activeTab,          setActiveTab]           = useState('chat')
  const [contextAnnotations, setContextAnnotations]  = useState([])
  const [thumbnailOpen,      setThumbnailOpen]       = useState(false)
  const [loadError,          setLoadError]           = useState(null)
  const [quizSeed,           setQuizSeed]            = useState(null)
  const [pendingChatPrompt,  setPendingChatPrompt]   = useState(null)
  const [focusSuggestedTick, setFocusSuggestedTick]   = useState(0)
  const [sidebarWidth,       setSidebarWidth]        = useState(SIDEBAR_DEFAULT)
  const [viewportWidth,      setViewportWidth]       = useState(() => window.innerWidth)
  const [retryCount,         setRetryCount]          = useState(0)
  const [toast,              setToast]               = useState(null)
  const prevSidebarWidthRef = useRef(SIDEBAR_DEFAULT)
  const toastTimerRef = useRef(null)

  const {
    annotations,
    remove: removeAnnotation,
    undoLast,
    lastUndoAction,
    undoBusy,
  } = useAnnotation(docId)
  const { getUnitForPage } = useLearningUnits(docId)
  const { unresolvedQuestions } = useLearningQuestionAnswers(docId)
  const isMobile = viewportWidth < 700

  // [B3] 주석이 삭제되면 stale contextAnnotations 자동 정리 (동일 ref 반환으로 루프 방지)
  useEffect(() => {
    const ids = new Set(annotations.map((a) => a.id))
    setContextAnnotations((prev) => {
      if (prev.every((a) => a.transient || ids.has(a.id))) return prev
      return prev.filter((a) => a.transient || ids.has(a.id))
    })
  }, [annotations])

  // 마인드맵 탭 전환 시 사이드바 5:5 자동 조정
  useEffect(() => {
    if (isMobile) return
    if (activeTab === 'mindmap') {
      prevSidebarWidthRef.current = sidebarWidth
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.floor(window.innerWidth / 2)))
    } else {
      setSidebarWidth(prevSidebarWidthRef.current)
    }
  // sidebarWidth는 의존성에서 제외 (전환 시점의 값만 스냅샷)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isMobile])

  // ── 사이드바 너비 드래그 리사이즈 ─────────────────────────────
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(SIDEBAR_DEFAULT)

  const handleResizerMouseDown = useCallback((e) => {
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [sidebarWidth])

  const handleResizerTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return
    isDraggingRef.current = true
    dragStartXRef.current = e.touches[0].clientX
    dragStartWidthRef.current = sidebarWidth
    document.body.style.userSelect = 'none'
  }, [sidebarWidth])

  useEffect(() => {
    function onMouseMove(e) {
      if (!isDraggingRef.current) return
      const delta = dragStartXRef.current - e.clientX
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidthRef.current + delta))
      setSidebarWidth(newWidth)
    }
    function onMouseUp() {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    function onTouchMove(e) {
      if (!isDraggingRef.current) return
      const delta = dragStartXRef.current - e.touches[0].clientX
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidthRef.current + delta))
      setSidebarWidth(newWidth)
    }
    function onTouchEnd() {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend',  onTouchEnd)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend',  onTouchEnd)
    }
  }, [])

  // viewport 너비 추적 (모바일 레이아웃 전환용)
  useEffect(() => {
    function onResize() { setViewportWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // [D1] retryCount 포함 — 재시도 시 effect 재실행
  useEffect(() => {
    if (!uid) return
    setStorageDoc({ blob: null, name: null })
    setLoadError(null)
    async function loadDoc() {
      const snap = await getDoc(doc(db, 'users', uid, 'documents', docId))
      if (!snap.exists()) { setLoadError('문서를 찾을 수 없습니다'); return }
      const meta = snap.data()
      const blob = await getBlob(ref(storage, meta.storagePath))
      setStorageDoc({ blob, name: meta.name })
    }
    loadDoc().catch((e) => setLoadError(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, uid, retryCount])

  // [B1] 토스트 표시 헬퍼
  function showToast(message, action = null) {
    clearTimeout(toastTimerRef.current)
    setToast({ message, action })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (!lastUndoAction) return
    showToast(lastUndoAction.message, {
      label: lastUndoAction.undoLabel ?? '실행 취소',
      onClick: undoLast,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUndoAction?.id])

  // [A1] 탭 변경 시 사이드바 항상 열기
  function handleTabChange(tab) {
    setActiveTab(tab)
    setSidebarOpen(true)
  }

  function showSuggestedQuestions() {
    setActiveTab('chat')
    setSidebarOpen(true)
    setFocusSuggestedTick(Date.now())
  }

  function requestPageChange(page) {
    const currentUnit = getUnitForPage(Math.max(0, currentPage - 1))
    const targetUnit = getUnitForPage(Math.max(0, page - 1))
    const pending = currentUnit?.focusQuestions?.length ? unresolvedQuestions(currentUnit) : []
    if (pending.length > 0 && currentUnit?.id && targetUnit?.id !== currentUnit.id) {
      setActiveTab('chat')
      setSidebarOpen(true)
      setFocusSuggestedTick(Date.now())
      showToast('추천 질문에 답변하거나 Skip을 누른 뒤 이동할 수 있습니다.')
      return false
    }
    setCurrentPage(page)
    return true
  }

  function handleSendToChat(annotation) {
    setContextAnnotations((prev) =>
      prev.find((a) => a.id === annotation.id) ? prev : [...prev, annotation]
    )
    if (annotation.autoPrompt) {
      setPendingChatPrompt({ id: `${annotation.id}:${Date.now()}`, text: annotation.autoPrompt })
    }
    setActiveTab('chat')
    setSidebarOpen(true)
    showToast('맥락이 Chat에 추가되었습니다')
  }

  function handleCreateQuiz(seed) {
    setQuizSeed({ ...seed, requestId: Date.now() })
    setActiveTab('quiz')
    setSidebarOpen(true)
  }

  function handleClearContext(id) {
    setContextAnnotations((prev) => prev.filter((a) => a.id !== id))
  }

  if (loadError) {
    return (
      <div style={styles.error}>
        <p style={styles.errorMsg}>{loadError}</p>
        <div style={styles.errorActions}>
          <button style={styles.retryBtn} onClick={() => setRetryCount((c) => c + 1)}>
            다시 시도
          </button>
          <button style={styles.backBtn} onClick={() => navigate('/')}>홈으로</button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <TopToolbar
        onHome={() => navigate('/')}
        onPageLabelClick={() => setThumbnailOpen((v) => !v)}
      />
      <div style={styles.body}>
        {/* 썸네일 패널 — TopToolbar 바로 아래 absolute overlay */}
        {thumbnailOpen && (
          <PageThumbnailPanel
            pdfBlob={pdfBlob}
            numPages={numPages}
            currentPage={currentPage}
            onPageSelect={(page) => {
              if (requestPageChange(page)) {
                useDocumentStore.getState().setViewMode('page')
              }
            }}
            onClose={() => setThumbnailOpen(false)}
          />
        )}
        <DocumentCanvas
          docId={docId}
          onSendToChat={handleSendToChat}
          onCreateQuiz={handleCreateQuiz}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          sidebarOpen={sidebarOpen}
          sidebarWidth={sidebarWidth}
          isMobile={isMobile}
          onSidebarToggle={() => setSidebarOpen((v) => !v)}
          onShowSuggestedQuestions={showSuggestedQuestions}
        />
        {sidebarOpen && (
          <>
            {/* 모바일: 반투명 배경 (클릭 시 닫기) */}
            {isMobile && (
              <div style={styles.backdrop} onClick={() => setSidebarOpen(false)} />
            )}
            {/* 데스크탑만 리사이즈 핸들 */}
            {!isMobile && (
              <div
                style={{ ...styles.resizer, right: sidebarWidth }}
                onMouseDown={handleResizerMouseDown}
                onTouchStart={handleResizerTouchStart}
                title="드래그하여 너비 조정"
              />
            )}
            <div style={isMobile
              ? { ...styles.sidebarWrapperMobile, width: Math.min(sidebarWidth, Math.round(viewportWidth * 0.85)) }
              : { ...styles.sidebarWrapper, width: sidebarWidth }
            }>
              <button
                type="button"
                style={styles.panelCloseBtn}
                onClick={() => setSidebarOpen(false)}
                aria-label="사이드바 닫기"
                title="사이드바 닫기"
              >
                ×
              </button>
              <SidePanel
                docId={docId}
                annotations={annotations}
                onDeleteAnnotation={removeAnnotation}
                onScrollToAnnotation={(ann) => {
                  requestPageChange(ann.pageIndex + 1)
                }}
                contextAnnotations={contextAnnotations}
                onClearContext={handleClearContext}
                onSendToChat={handleSendToChat}
                pendingChatPrompt={pendingChatPrompt}
                onPendingChatPromptConsumed={() => setPendingChatPrompt(null)}
                onPageJump={requestPageChange}
                focusSuggestedTick={focusSuggestedTick}
                quizSeed={quizSeed}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                currentPage={currentPage}
              />
            </div>
          </>
        )}

        {/* [B1] 토스트 알림 */}
        {toast && (
          <div style={styles.toast}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                style={styles.toastAction}
                onClick={async () => {
                  const ok = await toast.action.onClick?.()
                  if (ok !== false) setToast(null)
                }}
                disabled={undoBusy}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  root: { height: '100%', display: 'flex', flexDirection: 'column' },
  body: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  resizer: {
    width: 5,
    cursor: 'col-resize',
    background: 'rgba(255,255,255,0.01)',
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 25,
    transition: 'background 0.15s',
    '&:hover': { background: 'rgba(99,102,241,0.25)' },
  },
  sidebarWrapper: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
  },
  sidebarWrapperMobile: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
  },
  panelCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 2,
    border: '1px solid #e0e0e0',
    background: 'rgba(255,255,255,0.92)',
    color: '#333',
    width: 28,
    height: 28,
    borderRadius: 7,
    padding: 0,
    fontSize: 18,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    lineHeight: '26px',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    zIndex: 19,
  },
  error: {
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  errorMsg: { fontSize: 14, color: '#555' },
  errorActions: { display: 'flex', gap: 8 },
  retryBtn: {
    padding: '8px 20px', borderRadius: 8,
    background: '#6366f1', color: '#fff', fontSize: 14, cursor: 'pointer',
  },
  backBtn: {
    padding: '8px 20px', borderRadius: 8,
    background: '#1a1a1a', color: '#fff', fontSize: 14, cursor: 'pointer',
  },
  toast: {
    position: 'absolute',
    bottom: 72,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(30,30,30,0.88)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 16px',
    borderRadius: 20,
    pointerEvents: 'none',
    zIndex: 100,
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  toastAction: {
    pointerEvents: 'auto',
    border: '1px solid rgba(255,255,255,0.45)',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    borderRadius: 999,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
}
