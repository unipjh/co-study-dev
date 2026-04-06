import MemoCard from './MemoCard'

/**
 * Memo 탭 패널 — annotation 목록 표시
 *
 * @param {{ annotations, onDelete, onScrollTo, onSendToChat }} props
 */
export default function MemoPanel({ annotations = [], onDelete, onScrollTo, onSendToChat }) {
  const sorted = annotations
    .slice()
    .sort((a, b) => a.pageIndex - b.pageIndex || a.createdAt.localeCompare(b.createdAt))

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        메모
        {annotations.length > 0 && (
          <span style={styles.count}>{annotations.length}</span>
        )}
      </div>

      {annotations.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.hint}>
            텍스트를 드래그 후 색상을 선택하면<br />하이라이트 + 메모가 생성됩니다
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {sorted.map((ann) => (
            <MemoCard
              key={ann.id}
              annotation={ann}
              onDelete={onDelete}
              onScrollTo={onScrollTo}
              onSendToChat={onSendToChat}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#fff',
  },
  header: {
    padding: '12px 16px',
    fontWeight: 600,
    borderBottom: '1px solid #e8e8e8',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  count: {
    background: '#1a1a1a',
    color: '#fff',
    borderRadius: 10,
    padding: '1px 7px',
    fontSize: 11,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  hint: { color: '#bbb', fontSize: 13, textAlign: 'center', lineHeight: 1.7 },
  list: { flex: 1, overflowY: 'auto' },
}
