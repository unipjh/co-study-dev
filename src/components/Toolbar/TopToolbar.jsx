import useDocumentStore from '../../store/documentStore'

export default function TopToolbar({ onSidebarToggle, sidebarOpen, onHome, onPageLabelClick }) {
  const {
    pdfName, currentPage, numPages, zoomLevel, viewMode,
    setCurrentPage, setZoomLevel,
  } = useDocumentStore()

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        {onHome && (
          <button style={styles.homeBtn} onClick={onHome} title="홈으로">
            ←
          </button>
        )}
        {pdfName && (
          <span style={styles.fileName}>{pdfName}</span>
        )}
      </div>

      <div style={styles.center}>
        <button style={styles.iconBtn} onClick={() => setZoomLevel(zoomLevel - 0.1)}>−</button>
        <span style={styles.zoomLabel}>{Math.round(zoomLevel * 100)}%</span>
        <button style={styles.iconBtn} onClick={() => setZoomLevel(zoomLevel + 0.1)}>+</button>

        {viewMode === 'page' && numPages > 0 && (
          <>
            <span style={styles.divider} />
            <button
              style={styles.iconBtn}
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              ←
            </button>
            <button style={styles.pageLabel} onClick={onPageLabelClick}>
              {currentPage} / {numPages} ▾
            </button>
            <button
              style={styles.iconBtn}
              onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
            >
              →
            </button>
          </>
        )}
      </div>

      <div style={styles.right}>
        <button style={styles.iconBtn} onClick={onSidebarToggle}>
          {sidebarOpen ? '패널 닫기' : '패널 열기'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  bar: {
    height: 48,
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 12,
    flexShrink: 0,
  },
  left: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
  center: { display: 'flex', alignItems: 'center', gap: 4 },
  right: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' },
  homeBtn: {
    padding: '4px 10px',
    background: '#f0f0f0',
    color: '#1a1a1a',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 600,
  },
  fileName: { fontSize: 13, color: '#666', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  iconBtn: { padding: '4px 8px', borderRadius: 4, fontSize: 13, color: '#1a1a1a', background: '#f0f0f0' },
  zoomLabel: { minWidth: 36, textAlign: 'center', fontSize: 13 },
  pageLabel: {
    minWidth: 56, textAlign: 'center', fontSize: 13,
    padding: '4px 8px', borderRadius: 4,
    background: '#f0f0f0', color: '#1a1a1a', cursor: 'pointer',
  },
  divider: { width: 1, height: 20, background: '#e0e0e0', margin: '0 4px' },
}
