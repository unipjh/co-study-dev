import { useEffect, useState } from 'react'
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

export default function ViewerPage() {
  const { docId }    = useParams()
  const navigate     = useNavigate()
  const { setStorageDoc, pdfBlob, numPages, currentPage, setCurrentPage } = useDocumentStore()
  const uid = useAuthStore((s) => s.user?.uid)

  const [sidebarOpen,        setSidebarOpen]        = useState(true)
  const [activeTab,          setActiveTab]           = useState('chat')
  const [contextAnnotations, setContextAnnotations]  = useState([])
  const [thumbnailOpen,      setThumbnailOpen]       = useState(false)
  const [loadError,          setLoadError]           = useState(null)

  const { annotations, remove: removeAnnotation } = useAnnotation(docId)

  useEffect(() => {
    if (!uid) return
    async function loadDoc() {
      const snap = await getDoc(doc(db, 'users', uid, 'documents', docId))
      if (!snap.exists()) { setLoadError('문서를 찾을 수 없습니다'); return }
      const meta = snap.data()
      const blob = await getBlob(ref(storage, meta.storagePath))
      setStorageDoc({ blob, name: meta.name })
    }
    loadDoc().catch((e) => setLoadError(e.message))
  }, [docId, uid])

  function handleSendToChat(annotation) {
    setContextAnnotations((prev) =>
      prev.find((a) => a.id === annotation.id) ? prev : [...prev, annotation]
    )
    setActiveTab('chat')
    setSidebarOpen(true)
  }

  function handleClearContext(id) {
    setContextAnnotations((prev) => prev.filter((a) => a.id !== id))
  }

  if (loadError) {
    return (
      <div style={styles.error}>
        <p>{loadError}</p>
        <button style={styles.backBtn} onClick={() => navigate('/')}>홈으로</button>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <TopToolbar
        onSidebarToggle={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
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
              setCurrentPage(page)
              useDocumentStore.getState().setViewMode('page')
            }}
            onClose={() => setThumbnailOpen(false)}
          />
        )}
        <DocumentCanvas
          docId={docId}
          onSendToChat={handleSendToChat}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          sidebarOpen={sidebarOpen}
        />
        {sidebarOpen && (
          <SidePanel
            docId={docId}
            annotations={annotations}
            onDeleteAnnotation={removeAnnotation}
            onScrollToAnnotation={(ann) => {
              useDocumentStore.getState().setCurrentPage(ann.pageIndex + 1)
            }}
            contextAnnotations={contextAnnotations}
            onClearContext={handleClearContext}
            onSendToChat={handleSendToChat}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
      </div>
    </div>
  )
}

const styles = {
  root: { height: '100%', display: 'flex', flexDirection: 'column' },
  body: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  error: {
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  backBtn: {
    padding: '8px 20px', borderRadius: 8,
    background: '#1a1a1a', color: '#fff', fontSize: 14, cursor: 'pointer',
  },
}
