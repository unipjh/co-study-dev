import { useState } from 'react'

const PRIORITY_LABELS = {
  low: '가볍게',
  medium: '중요',
  high: '우선',
}

export default function LearningGoalOverlay({
  goal,
  loading,
  error,
  indexing,
  indexProgress,
  indexTotal,
  unavailable,
  pageNumber,
  pageRange,
  pageHint,
  onToggleComplete,
  onRegenerate,
}) {
  const [expanded, setExpanded] = useState(false)
  const [busyAction, setBusyAction] = useState(false)

  const statusText = loading
    ? '목표 생성 중'
    : indexing
      ? `목표 준비 중${indexTotal > 0 ? ` ${indexProgress}/${indexTotal}` : ''}`
      : unavailable
        ? '텍스트 부족'
        : error && !goal
          ? '생성 실패'
          : goal?.completed
            ? '완료됨'
            : PRIORITY_LABELS[goal?.priority] || '목표'

  const mainText = goal?.mainObjective
    || (indexing ? '페이지 색인이 끝나면 핵심 학습 목표를 준비합니다.' : null)
    || (unavailable ? '이 페이지는 텍스트 기반 목표를 만들 수 없습니다.' : null)
    || error
    || '핵심 학습 목표를 준비하고 있습니다.'

  async function runAction(action) {
    if (!action || busyAction) return
    setBusyAction(true)
    try {
      await action()
    } finally {
      setBusyAction(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={{ ...styles.card, ...(goal?.completed ? styles.cardDone : {}) }}>
        <button
          type="button"
          style={styles.summary}
          onClick={() => setExpanded((v) => !v)}
          title="핵심 학습 목표 펼치기"
        >
          <span style={styles.badge}>{statusText}</span>
          <span style={{ ...styles.mainText, ...(expanded ? styles.mainTextExpanded : {}) }}>
            <strong style={styles.label}>이번 페이지 핵심</strong>
            {mainText}
          </span>
          <span style={styles.chevron}>{expanded ? '⌃' : '∨'}</span>
        </button>
      </div>

      {expanded && (
        <div style={styles.popup}>
          {goal && (
            <>
              {pageHint && (
                <div style={styles.pageFocus}>
                  <span style={styles.pageFocusLabel}>이번 페이지에서 볼 것</span>
                  {pageHint}
                </div>
              )}
              {goal.objectives?.length > 0 && (
                <div style={styles.block}>
                  <div style={styles.blockTitle}>📌 읽기 포인트</div>
                  {goal.objectives.map((item, index) => (
                    <div key={index} style={styles.item}>{item}</div>
                  ))}
                </div>
              )}
              {goal.focusQuestions?.length > 0 && (
                <div style={styles.questionBlock}>
                  <div style={styles.blockTitle}>생각해 보기</div>
                  {goal.focusQuestions.map((item, index) => (
                    <div key={index} style={styles.questionItem}>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}
              {goal.keywords?.length > 0 && (
                <div style={styles.keywords}>
                  {goal.keywords.map((keyword) => (
                    <span key={keyword} style={styles.keyword}>{keyword}</span>
                  ))}
                </div>
              )}
            </>
          )}

          {error && <div style={styles.error}>{error}</div>}
          <div style={styles.actions}>
            <span style={styles.pageHint}>{pageRange ?? `${pageNumber}p`}</span>
            <button
              type="button"
              style={styles.actionBtn}
              onClick={() => runAction(onRegenerate)}
              disabled={busyAction || loading || unavailable}
            >
              다시 생성
            </button>
            <button
              type="button"
              style={{ ...styles.actionBtn, ...styles.closeActionBtn }}
              onClick={() => setExpanded(false)}
              disabled={busyAction}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: {
    position: 'relative',
    width: '100%',
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'center',
    padding: '12px clamp(12px, 5vw, 56px)',
    background: '#ffffff',
    borderBottom: '1px solid #efeff6',
    zIndex: 18,
    pointerEvents: 'none',
    fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: 'min(1200px, 100%)',
    borderRadius: 5,
    background: '#ffffff',
    border: '1px solid #e1e1ec',
    boxShadow: '0 8px 18px rgba(7,7,97,0.08)',
    color: '#202124',
    pointerEvents: 'auto',
    overflow: 'hidden',
  },
  cardDone: {
    opacity: 0.78,
  },
  summary: {
    width: '100%',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    padding: '8px 22px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
  },
  badge: {
    flexShrink: 0,
    padding: '4px 9px',
    borderRadius: 5,
    background: '#eeeef8',
    color: '#070761',
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  label: {
    marginRight: 8,
    color: '#111111',
    fontWeight: 900,
  },
  mainText: {
    flex: 1,
    minWidth: 0,
    color: '#111111',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  mainTextExpanded: {
    display: 'block',
    overflow: 'visible',
  },
  chevron: {
    flexShrink: 0,
    color: '#77778a',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  popup: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 24px)',
    maxWidth: 1200,
    maxHeight: 'min(56vh, 440px)',
    overflowY: 'auto',
    border: '1px solid #e1e1ec',
    borderRadius: 5,
    background: '#ffffff',
    boxShadow: '0 18px 42px rgba(7,7,97,0.14)',
    padding: '28px 30px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
    pointerEvents: 'auto',
  },
  block: {
    display: 'grid',
    gap: 12,
  },
  questionBlock: {
    display: 'grid',
    gap: 10,
    padding: 0,
    borderRadius: 5,
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
  },
  blockTitle: {
    color: '#070761',
    fontSize: 16,
    fontWeight: 900,
  },
  item: {
    color: '#111111',
    fontSize: 15,
    lineHeight: '25px',
    fontWeight: 650,
  },
  questionItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 0,
    color: '#111111',
    fontSize: 15,
    lineHeight: '24px',
    fontWeight: 700,
  },
  pageFocus: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    borderRadius: 5,
    background: '#f8f8ff',
    color: '#333',
    fontSize: 15,
    lineHeight: '25px',
  },
  pageFocusLabel: {
    color: '#070761',
    fontSize: 12,
    fontWeight: 900,
  },
  keywords: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  keyword: {
    padding: '7px 16px',
    borderRadius: 5,
    background: '#f0f0fb',
    color: '#070761',
    fontSize: 13,
    fontWeight: 900,
  },
  error: {
    color: '#b42318',
    background: '#fff3f0',
    borderRadius: 5,
    padding: '7px 8px',
    fontSize: 12,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  pageHint: {
    marginRight: 'auto',
    color: '#777',
    fontSize: 11,
    fontWeight: 700,
  },
  actionBtn: {
    border: 'none',
    background: '#efeffa',
    color: '#070761',
    borderRadius: 5,
    padding: '8px 18px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  closeActionBtn: {
    background: '#070761',
    color: '#ffffff',
  },
  completeBtn: {
    background: '#ecfdf3',
    borderColor: '#abefc6',
    color: '#067647',
  },
}
