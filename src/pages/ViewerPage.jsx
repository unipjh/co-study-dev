import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ref, getBlob } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import useDocumentStore from '../store/documentStore'
import TopToolbar from '../components/Toolbar/TopToolbar'
import DocumentCanvas from '../components/Canvas/DocumentCanvas'
import SidePanel from '../components/Sidebar/SidePanel'
import useAnnotation from '../hooks/useAnnotation'

export default function ViewerPage() {
  const { docId }    = useParams()
  const navigate     = useNavigate()
  const { setStorageDoc } = useDocumentStore()

  const [sidebarOpen,       setSidebarOpen]       = useState(true)
  const [activeTab,         setActiveTab]          = useState('chat')
  const [contextAnnotation, setContextAnnotation]  = useState(null)
  const [loadError,         setLoadError]          = useState(null)

  const { annotations, remove: removeAnnotation } = useAnnotation(docId)

  useEffect(() => {
    async function loadDoc() {
      const snap = await getDoc(doc(db, 'documents', docId))
      if (!snap.exists()) { setLoadError('문서를 찾을 수 없습니다'); return }
      const meta = snap.data()

      // Blob을 직접 react-pdf에 전달 — Blob URL 불필요
      const blob = await getBlob(ref(storage, meta.storagePath))
      setStorageDoc({ blob, name: meta.name })
    }
    loadDoc().catch((e) => setLoadError(e.message))
  }, [docId])

  function handleSendToChat(annotation) {
    setContextAnnotation(annotation)
    setActiveTab('chat')
    setSidebarOpen(true)
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
      />
      <div style={styles.body}>
        <DocumentCanvas docId={docId} onSendToChat={handleSendToChat} />
        {sidebarOpen && (
          <SidePanel
            docId={docId}
            annotations={annotations}
            onDeleteAnnotation={removeAnnotation}
            onScrollToAnnotation={(ann) => {
              useDocumentStore.getState().setCurrentPage(ann.pageIndex + 1)
            }}
            contextAnnotation={contextAnnotation}
            onClearContext={() => setContextAnnotation(null)}
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
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  error: {
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  backBtn: {
    padding: '8px 20px', borderRadius: 8,
    background: '#1a1a1a', color: '#fff', fontSize: 14, cursor: 'pointer',
  },
}
