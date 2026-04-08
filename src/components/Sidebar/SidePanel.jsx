import ChatPanel from './ChatPanel'
import MemoPanel from './MemoPanel'

/**
 * 우측 사이드 패널 — Chat / Memo / MindMap 탭 컨테이너
 * 탭 전환은 하단 바에서 처리
 *
 * @param {{
 *   docId,
 *   annotations,
 *   onDeleteAnnotation,
 *   onScrollToAnnotation,
 *   contextAnnotations,
 *   onClearContext,
 *   onSendToChat,
 *   activeTab,
 * }} props
 */
export default function SidePanel({
  docId,
  annotations,
  onDeleteAnnotation,
  onScrollToAnnotation,
  contextAnnotations,
  onClearContext,
  onSendToChat,
  activeTab,
}) {
  return (
    <div style={styles.panel}>
      {activeTab === 'chat' && (
        <ChatPanel
          docId={docId}
          contextAnnotations={contextAnnotations}
          onClearContext={onClearContext}
        />
      )}
      {activeTab === 'memo' && (
        <MemoPanel
          annotations={annotations}
          onDelete={onDeleteAnnotation}
          onScrollTo={onScrollToAnnotation}
          onSendToChat={(ann) => {
            onSendToChat?.(ann)
          }}
        />
      )}
      {activeTab === 'mindmap' && (
        <div style={styles.comingSoon}>
          <p style={styles.comingSoonText}>준비 중입니다</p>
        </div>
      )}
    </div>
  )
}

const styles = {
  panel: {
    width: 300,
    background: '#fff',
    borderLeft: '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  comingSoon: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: { color: '#ccc', fontSize: 14 },
}
