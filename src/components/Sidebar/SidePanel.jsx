import ChatPanel from './ChatPanel'
import MemoPanel from './MemoPanel'

const TABS = [
  { key: 'chat',    label: 'Chat' },
  { key: 'memo',    label: 'Memo' },
  { key: 'mindmap', label: 'MindMap', disabled: true },
]

/**
 * 우측 사이드 패널 — Chat / Memo / MindMap 탭 컨테이너
 *
 * @param {{
 *   docId,
 *   annotations,
 *   onDeleteAnnotation,
 *   onScrollToAnnotation,
 *   contextAnnotation,
 *   onClearContext,
 *   onSendToChat,
 *   activeTab,
 *   onTabChange
 * }} props
 */
export default function SidePanel({
  docId,
  annotations,
  onDeleteAnnotation,
  onScrollToAnnotation,
  contextAnnotation,
  onClearContext,
  onSendToChat,
  activeTab,
  onTabChange,
}) {
  return (
    <div style={styles.panel}>
      {/* 탭 헤더 */}
      <div style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
              ...(tab.disabled ? styles.tabDisabled : {}),
            }}
            onClick={() => !tab.disabled && onTabChange?.(tab.key)}
            disabled={tab.disabled}
          >
            {tab.label}
            {tab.disabled && <span style={styles.soon}> soon</span>}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div style={styles.content}>
        {activeTab === 'chat' && (
          <ChatPanel
            docId={docId}
            contextAnnotation={contextAnnotation}
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
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e8e8e8',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '11px 0',
    fontSize: 13,
    fontWeight: 500,
    color: '#aaa',
    background: '#fff',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: '#1a1a1a',
    borderBottom: '2px solid #1a1a1a',
    fontWeight: 700,
  },
  tabDisabled: {
    opacity: 0.38,
    cursor: 'default',
  },
  soon: { fontSize: 9, color: '#bbb', verticalAlign: 'super' },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
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
