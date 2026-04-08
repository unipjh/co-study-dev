import { useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useDocumentList from '../hooks/useDocumentList'
import useDocumentUpload from '../hooks/useDocumentUpload'
import useAuth from '../hooks/useAuth'

const SORT_OPTIONS = [
  { key: 'date',  label: '최신순' },
  { key: 'name',  label: '이름순' },
  { key: 'pages', label: '페이지순' },
]

export default function LibraryPage() {
  const navigate              = useNavigate()
  const { documents, loading, remove, moveToFolder, deleteFolder } = useDocumentList()
  const { upload, progress, uploading }              = useDocumentUpload()
  const { user, signOut }                            = useAuth()
  const fileInputRef = useRef(null)

  const [sortBy,       setSortBy]       = useState('date')
  const [activeFolder, setActiveFolder] = useState(null)  // null = 전체
  const [editingFolder, setEditingFolder] = useState(null) // { docId, value }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const meta = await upload(file)
    if (meta) navigate(`/doc/${meta.docId}`)
  }

  async function handleDelete(e, doc) {
    e.stopPropagation()
    if (!window.confirm(`"${doc.name}" 을 삭제할까요?`)) return
    await remove(doc.docId, doc.storagePath)
  }

  // 폴더 목록 (unique, null 제외)
  const folders = useMemo(
    () => [...new Set(documents.map((d) => d.folder).filter(Boolean))].sort(),
    [documents]
  )

  // 정렬 + 폴더 필터
  const visibleDocs = useMemo(() => {
    let list = activeFolder
      ? documents.filter((d) => d.folder === activeFolder)
      : documents
    if (sortBy === 'name')  list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    if (sortBy === 'pages') list = [...list].sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0))
    // 'date'는 Firestore가 uploadedAt desc로 이미 정렬
    return list
  }, [documents, sortBy, activeFolder])

  function startFolderEdit(e, doc) {
    e.stopPropagation()
    setEditingFolder({ docId: doc.docId, value: doc.folder || '' })
  }

  async function commitFolderEdit(docId) {
    if (!editingFolder) return
    const val = editingFolder.value.trim()
    await moveToFolder(docId, val || null)
    setEditingFolder(null)
  }

  return (
    <div style={styles.root}>
      {/* 헤더 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>내 자료</h1>
          {user && (
            <span style={styles.userLabel}>{user.displayName || user.email}</span>
          )}
        </div>
        <div style={styles.headerRight}>
          {/* 정렬 */}
          <div style={styles.sortRow}>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                style={{ ...styles.sortBtn, ...(sortBy === opt.key ? styles.sortBtnActive : {}) }}
                onClick={() => setSortBy(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label style={styles.addBtn}>
            {uploading ? `업로드 중... ${progress}%` : '+ 자료 추가'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          <button style={styles.signOutBtn} onClick={signOut} title="로그아웃">↩</button>
        </div>
      </div>

      {/* 업로드 progress bar */}
      {uploading && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      )}

      {/* 폴더 필터 탭 */}
      {folders.length > 0 && (
        <div style={styles.folderTabs}>
          <button
            style={{ ...styles.folderTab, ...(activeFolder === null ? styles.folderTabActive : {}) }}
            onClick={() => setActiveFolder(null)}
          >
            전체
          </button>
          {folders.map((f) => (
            <div key={f} style={styles.folderTabWrap}>
              <button
                style={{ ...styles.folderTab, ...(activeFolder === f ? styles.folderTabActive : {}) }}
                onClick={() => setActiveFolder(f)}
              >
                📁 {f}
              </button>
              <button
                style={styles.folderDeleteBtn}
                title="폴더 삭제"
                onClick={async (e) => {
                  e.stopPropagation()
                  if (!window.confirm(`"${f}" 폴더를 삭제할까요?\n(문서는 유지되며 폴더 분류만 해제됩니다)`)) return
                  if (activeFolder === f) setActiveFolder(null)
                  await deleteFolder(f)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 문서 목록 */}
      {loading ? (
        <div style={styles.center}><p style={styles.hint}>불러오는 중...</p></div>
      ) : visibleDocs.length === 0 ? (
        <div style={styles.center}>
          <p style={styles.hint}>
            {activeFolder ? `"${activeFolder}" 폴더가 비어있습니다` : '자료를 추가해 학습을 시작하세요'}
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {visibleDocs.map((doc) => (
            <div
              key={doc.docId}
              style={styles.card}
              onClick={() => navigate(`/doc/${doc.docId}`)}
            >
              <div style={styles.cardIcon}>PDF</div>

              <div style={styles.cardBody}>
                <p style={styles.cardName} title={doc.name}>{doc.name}</p>
                <p style={styles.cardMeta}>
                  {doc.pageCount > 0 ? `${doc.pageCount}p · ` : ''}
                  {new Date(doc.uploadedAt).toLocaleDateString('ko-KR')}
                </p>
              </div>

              {/* 폴더 배지 / 편집 */}
              <div style={styles.cardFooter} onClick={(e) => e.stopPropagation()}>
                {editingFolder?.docId === doc.docId ? (
                  <input
                    autoFocus
                    style={styles.folderInput}
                    value={editingFolder.value}
                    onChange={(e) => setEditingFolder((prev) => ({ ...prev, value: e.target.value }))}
                    onBlur={() => commitFolderEdit(doc.docId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitFolderEdit(doc.docId)
                      if (e.key === 'Escape') setEditingFolder(null)
                    }}
                    placeholder="폴더명 입력"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    style={styles.folderBadge}
                    onClick={(e) => startFolderEdit(e, doc)}
                    title="폴더 지정"
                  >
                    {doc.folder ? `📁 ${doc.folder}` : '+ 폴더'}
                  </button>
                )}
              </div>

              <button
                style={styles.deleteBtn}
                onClick={(e) => handleDelete(e, doc)}
                title="삭제"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#f5f5f5',
    padding: '40px 48px',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: { display: 'flex', alignItems: 'baseline', gap: 10 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  userLabel: { fontSize: 12, color: '#aaa' },
  sortRow: { display: 'flex', gap: 4 },
  sortBtn: {
    padding: '5px 10px',
    borderRadius: 6,
    fontSize: 12,
    color: '#666',
    background: '#fff',
    border: '1px solid #e0e0e0',
    cursor: 'pointer',
  },
  sortBtnActive: {
    background: '#1a1a1a',
    color: '#fff',
    border: '1px solid #1a1a1a',
    fontWeight: 700,
  },
  addBtn: {
    padding: '8px 20px',
    background: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  signOutBtn: {
    padding: '8px 10px',
    background: '#f0f0f0',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    cursor: 'pointer',
    color: '#666',
  },
  progressBar: {
    height: 4, background: '#e0e0e0', borderRadius: 2, marginBottom: 24, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', background: '#6366f1', borderRadius: 2, transition: 'width 0.2s',
  },
  folderTabs: {
    display: 'flex',
    gap: 6,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  folderTabWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  folderTab: {
    padding: '5px 12px',
    borderRadius: 20,
    fontSize: 12,
    color: '#666',
    background: '#fff',
    border: '1px solid #e0e0e0',
    cursor: 'pointer',
  },
  folderTabActive: {
    background: '#6366f1',
    color: '#fff',
    border: '1px solid #6366f1',
    fontWeight: 700,
  },
  folderDeleteBtn: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#e0e0e0',
    color: '#888',
    fontSize: 13,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    padding: 0,
    flexShrink: 0,
  },
  center: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: 120,
  },
  hint: { color: '#aaa', fontSize: 15 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '16px',
    cursor: 'pointer',
    border: '1px solid #e8e8e8',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    position: 'relative',
    transition: 'box-shadow 0.15s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardIcon: {
    width: '100%',
    height: 100,
    background: '#f0f0ff',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 700,
    color: '#6366f1',
    letterSpacing: 1,
  },
  cardBody: { display: 'flex', flexDirection: 'column', gap: 4 },
  cardName: {
    fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  cardMeta: { fontSize: 11, color: '#aaa', margin: 0 },
  cardFooter: { marginTop: -4 },
  folderBadge: {
    fontSize: 11,
    color: '#999',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
  },
  folderInput: {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid #6366f1',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  deleteBtn: {
    position: 'absolute', top: 8, right: 10,
    fontSize: 18, color: '#ccc', cursor: 'pointer',
    lineHeight: 1, padding: '0 2px',
    background: 'transparent', border: 'none',
  },
}
