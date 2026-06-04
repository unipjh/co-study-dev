import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useDocumentList from '../hooks/useDocumentList'
import useDocumentUpload from '../hooks/useDocumentUpload'
import useAuth from '../hooks/useAuth'
import CoStudyLogo, { CoStudyMark } from '../components/Brand/CoStudyLogo'
import InteractionLogDashboard from '../components/InteractionLogDashboard'
import { logInteraction } from '../lib/interactionLogs'
import './LibraryPage.css'

const SORT_OPTIONS = [
  { key: 'date', label: '최신순' },
  { key: 'name', label: '이름순' },
  { key: 'pages', label: '페이지순' },
]

function formatLastOpened(uploadedAt) {
  if (!uploadedAt) return '최근 열람 기록 없음'
  const date = new Date(uploadedAt)
  if (Number.isNaN(date.getTime())) return '최근 열람 기록 없음'

  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
  if (days <= 0) return '오늘 마지막 열람'
  if (days === 1) return '1일 전에 마지막 열람'
  return `${days}일 전에 마지막 열람`
}

function SearchIcon() {
  return (
    <svg className="library-search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6Zm5.2-2.1 4.5 4.5" />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 13h6v7H4zM14 4h6v16h-6zM4 4h6v5H4z" />
    </svg>
  )
}

function FolderCard({ name, count, active, onClick }) {
  return (
    <button
      type="button"
      className={`library-card library-folder-card ${active ? 'is-mint' : ''}`}
      onClick={onClick}
    >
      <span className="library-folder-line" />
      <span className="library-card-title">{name || '폴더 이름'}</span>
      <span className="library-card-meta">{count}개의 파일</span>
      <span className="library-card-subtle">1일 전에 마지막 열람</span>
    </button>
  )
}

function FileCard({ doc, accent, onOpen, onStartFolderEdit, editingFolder, onFolderChange, onFolderCommit, onFolderCancel, onDelete }) {
  return (
    <article className={`library-card library-file-card ${accent === 'mint' ? 'is-mint' : ''}`} onClick={onOpen}>
      <div className="library-preview-box">미리보기 화면</div>
      <h3 className="library-card-title" title={doc.name}>{doc.name || '파일 이름'}</h3>
      <p className="library-card-subtle">{formatLastOpened(doc.uploadedAt)}</p>

      <div className="library-card-actions" onClick={(event) => event.stopPropagation()}>
        {editingFolder?.docId === doc.docId ? (
          <input
            className="library-folder-input"
            autoFocus
            value={editingFolder.value}
            placeholder="폴더 이름"
            onChange={(event) => onFolderChange(event.target.value)}
            onBlur={onFolderCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onFolderCommit()
              if (event.key === 'Escape') onFolderCancel()
            }}
          />
        ) : (
          <button type="button" className="library-inline-action" onClick={onStartFolderEdit}>
            {doc.folder ? doc.folder : '폴더 지정'}
          </button>
        )}
        <button type="button" className="library-inline-action is-danger" onClick={onDelete}>
          삭제
        </button>
      </div>
    </article>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { documents, loading, remove, moveToFolder, deleteFolder } = useDocumentList()
  const { upload, progress, uploading } = useDocumentUpload()
  const { user, signOut } = useAuth()
  const fileInputRef = useRef(null)

  const [sortBy, setSortBy] = useState('date')
  const [query, setQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState(null)
  const [editingFolder, setEditingFolder] = useState(null)
  const [logDashboardOpen, setLogDashboardOpen] = useState(false)

  const folders = useMemo(() => {
    const map = new Map()
    documents.forEach((doc) => {
      if (!doc.folder) return
      map.set(doc.folder, (map.get(doc.folder) || 0) + 1)
    })
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [documents])

  const visibleDocs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    let list = activeFolder
      ? documents.filter((doc) => doc.folder === activeFolder)
      : documents.filter((doc) => !doc.folder)

    if (normalizedQuery) {
      list = list.filter((doc) =>
        [doc.name, doc.folder].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery))
      )
    }
    if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    if (sortBy === 'pages') list = [...list].sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0))
    return list
  }, [documents, sortBy, activeFolder, query])

  async function handleFileChange(event) {
    const file = event.target.files[0]
    if (!file) return
    event.target.value = ''
    const meta = await upload(file)
    if (meta) navigate(`/doc/${meta.docId}`)
  }

  async function handleDelete(event, doc) {
    event.stopPropagation()
    if (!window.confirm(`"${doc.name}" 자료를 삭제할까요?`)) return
    await remove(doc.docId, doc.storagePath)
    logInteraction('document_delete', {
      docId: doc.docId,
      name: doc.name,
      source: 'library',
    })
  }

  function startFolderEdit(event, doc) {
    event.stopPropagation()
    setEditingFolder({ docId: doc.docId, value: doc.folder || '' })
  }

  async function commitFolderEdit() {
    if (!editingFolder) return
    await moveToFolder(editingFolder.docId, editingFolder.value.trim() || null)
    logInteraction('document_folder_change', {
      docId: editingFolder.docId,
      folder: editingFolder.value.trim() || null,
      source: 'library',
    })
    setEditingFolder(null)
  }

  async function handleDeleteFolder(folderName) {
    if (!window.confirm(`"${folderName}" 폴더를 비울까요?\n문서는 유지되고 폴더 분류만 해제됩니다.`)) return
    if (activeFolder === folderName) setActiveFolder(null)
    await deleteFolder(folderName)
    logInteraction('folder_clear', {
      folder: folderName,
      source: 'library',
    })
  }

  function handleOpenDocument(doc) {
    logInteraction('document_open', {
      docId: doc.docId,
      name: doc.name,
      folder: doc.folder ?? null,
      source: 'library',
    })
    navigate(`/doc/${doc.docId}`)
  }

  function handleOpenFolder(folderName) {
    logInteraction('folder_open', {
      folder: folderName,
      source: 'library',
    })
    setActiveFolder(folderName)
  }

  function handleBackToRootFolder() {
    logInteraction('folder_back_to_root', {
      folder: activeFolder,
      source: 'library',
    })
    setActiveFolder(null)
  }

  function handleSortChange(value) {
    setSortBy(value)
    logInteraction('library_sort_change', {
      sortBy: value,
      source: 'library',
    })
  }

  function handleOpenLogDashboard() {
    logInteraction('log_dashboard_open', { source: 'library' })
    setLogDashboardOpen(true)
  }

  return (
    <main className="library-shell">
      <aside className="library-sidebar">
        <div className="library-brand">
          <CoStudyLogo className="library-logo" />
          <button type="button" className="library-sidebar-toggle" aria-label="사이드바 접기">
            <span />
          </button>
        </div>

        <button
          type="button"
          className="library-log-dashboard-button"
          onClick={handleOpenLogDashboard}
          aria-label="사용자 로그 대시보드 열기"
          title="사용자 로그"
        >
          <DashboardIcon />
        </button>

        <div className="library-account">
          <CoStudyMark className="library-avatar" title="Co-Study profile" />
          <div className="library-account-copy">
            <strong>{user?.displayName || '코워커'}</strong>
            <span>{user?.email || 'co-worker@email.com'}</span>
          </div>
          <button type="button" className="library-signout" onClick={signOut} aria-label="로그아웃" title="로그아웃">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6H5v12h4M14 8l4 4-4 4M18 12H9" />
            </svg>
          </button>
        </div>
      </aside>

      <section className="library-main">
        <header className="library-header">
          <h1>내 자료</h1>
          <label className="library-upload-button">
            {uploading ? `업로드 중 ${progress}%` : '+ 자료 추가'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </label>
        </header>

        <div className="library-search-row">
          <div className="library-search">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="검색하기"
              aria-label="자료 검색"
            />
          </div>
        </div>

        {uploading && (
          <div className="library-upload-progress" aria-label={`업로드 진행률 ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="library-controls">
          {activeFolder ? (
            <button type="button" className="library-folder-heading" onClick={handleBackToRootFolder}>
              <span aria-hidden="true">‹</span>
              {activeFolder}
            </button>
          ) : (
            <span className="library-folder-heading-placeholder" />
          )}
          <select value={sortBy} onChange={(event) => handleSortChange(event.target.value)} aria-label="정렬">
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>

        {activeFolder && <div className="library-divider" />}

        {loading ? (
          <div className="library-state">자료를 불러오는 중입니다.</div>
        ) : (
          <div className="library-grid">
            {!activeFolder && folders.map((folder, index) => (
              <div className="library-folder-wrap" key={folder.name}>
                <FolderCard
                  name={folder.name}
                  count={folder.count}
                  active={index === 2}
                  onClick={() => handleOpenFolder(folder.name)}
                />
                <button
                  type="button"
                  className="library-folder-delete"
                  onClick={() => handleDeleteFolder(folder.name)}
                  aria-label={`${folder.name} 폴더 비우기`}
                >
                  ×
                </button>
              </div>
            ))}

            {visibleDocs.map((doc, index) => (
              <FileCard
                key={doc.docId}
                doc={doc}
                accent={index % 2 === 1 ? 'mint' : 'indigo'}
                onOpen={() => handleOpenDocument(doc)}
                editingFolder={editingFolder}
                onStartFolderEdit={(event) => startFolderEdit(event, doc)}
                onFolderChange={(value) => setEditingFolder((prev) => ({ ...prev, value }))}
                onFolderCommit={commitFolderEdit}
                onFolderCancel={() => setEditingFolder(null)}
                onDelete={(event) => handleDelete(event, doc)}
              />
            ))}
          </div>
        )}

        {!loading && folders.length === 0 && visibleDocs.length === 0 && (
          <div className="library-empty">
            <h2>아직 자료가 없습니다.</h2>
            <p>PDF를 추가하면 Co-Study가 읽기, 메모, 질문 흐름을 이어갈 수 있게 도와줍니다.</p>
            <button type="button" onClick={() => fileInputRef.current?.click()}>자료 추가하기</button>
          </div>
        )}

        <InteractionLogDashboard
          open={logDashboardOpen}
          onClose={() => setLogDashboardOpen(false)}
        />
      </section>
    </main>
  )
}
