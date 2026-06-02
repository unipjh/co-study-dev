import MemoCard from './MemoCard'

export default function MemoPanel({ annotations = [], onDelete, onScrollTo, onSendToChat }) {
  const sorted = annotations
    .slice()
    .sort((a, b) => a.pageIndex - b.pageIndex || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))

  return (
    <div style={styles.panel}>
      <header style={styles.header}>
        <h2 style={styles.title}>메모</h2>
        {annotations.length > 0 && (
          <span style={styles.count}>{annotations.length}</span>
        )}
      </header>

      {annotations.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.hint}>
            텍스트를 드래그한 뒤 색상을 선택하면
            <br />
            하이라이트와 메모가 여기에 모입니다.
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
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#ffffff',
    color: '#000000',
  },
  header: {
    height: 70,
    padding: '24px 28px 18px',
    borderBottom: '1px solid #eeeeee',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  title: {
    fontSize: 22.5,
    lineHeight: '20px',
    fontWeight: 800,
    letterSpacing: 0,
    color: '#000000',
  },
  count: {
    minWidth: 31,
    height: 22,
    padding: '1px 9px',
    borderRadius: 11,
    background: '#070761',
    color: '#ffffff',
    fontSize: 15,
    lineHeight: '20px',
    fontWeight: 800,
    textAlign: 'center',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  hint: {
    color: '#9b9b9b',
    fontSize: 13,
    lineHeight: '22px',
    textAlign: 'center',
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    background: '#ffffff',
  },
}
