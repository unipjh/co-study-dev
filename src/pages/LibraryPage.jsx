import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useDocumentList from '../hooks/useDocumentList'
import useDocumentUpload from '../hooks/useDocumentUpload'

export default function LibraryPage() {
  const navigate              = useNavigate()
  const { documents, loading, remove } = useDocumentList()
  const { upload, progress, uploading } = useDocumentUpload()
  const fileInputRef          = useRef(null)

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

  return (
    <div style={styles.root}>
      {/* 헤더 */}
      <div style={styles.header}>
        <h1 style={styles.title}>내 자료</h1>
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
      </div>

      {/* 업로드 progress bar */}
      {uploading && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      )}

      {/* 문서 목록 */}
      {loading ? (
        <div style={styles.center}><p style={styles.hint}>불러오는 중...</p></div>
      ) : documents.length === 0 ? (
        <div style={styles.center}>
          <p style={styles.hint}>자료를 추가해 학습을 시작하세요</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {documents.map((doc) => (
            <div
              key={doc.docId}
              style={styles.card}
              onClick={() => navigate(`/doc/${doc.docId}`)}
            >
              {/* PDF 아이콘 */}
              <div style={styles.cardIcon}>PDF</div>

              <div style={styles.cardBody}>
                <p style={styles.cardName} title={doc.name}>{doc.name}</p>
                <p style={styles.cardMeta}>
                  {doc.pageCount > 0 ? `${doc.pageCount}p · ` : ''}
                  {new Date(doc.uploadedAt).toLocaleDateString('ko-KR')}
                </p>
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
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
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
  progressBar: {
    height: 4,
    background: '#e0e0e0',
    borderRadius: 2,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#6366f1',
    borderRadius: 2,
    transition: 'width 0.2s',
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 120,
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
    fontSize: 13,
    fontWeight: 600,
    color: '#1a1a1a',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardMeta: { fontSize: 11, color: '#aaa', margin: 0 },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    fontSize: 18,
    color: '#ccc',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 2px',
    background: 'transparent',
    border: 'none',
  },
}
