import ChatPanel from './ChatPanel'
import MemoPanel from './MemoPanel'
import MindMapPanel from './MindMapPanel'

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
  currentPage,
}) {
  return (
    <div style={styles.panel}>
      {activeTab === 'chat' && (
        <ChatPanel
          docId={docId}
          contextAnnotations={contextAnnotations}
          onClearContext={onClearContext}
          currentPage={currentPage}
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
        <MindMapPanel docId={docId} />
      )}
    </div>
  )
}

const styles = {
  panel: {
    width: '100%',
    height: '100%',
    background: '#fff',
    borderLeft: '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
}
