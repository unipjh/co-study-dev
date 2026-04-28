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
  onToggleComplete,
  onRegenerate,
}) {
  const [expanded, setExpanded] = useState(false)
  const [busyAction, setBusyAction] = useState(false)

  const statusText = loading
    ? '목표 생성 중'
    : indexing
      ? `목표 준비 중 ${indexTotal > 0 ? `${indexProgress}/${indexTotal}` : ''}`
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
            <strong style={styles.label}>핵심 목표</strong>
            {mainText}
          </span>
          <span style={styles.chevron}>{expanded ? '접기' : '보기'}</span>
        </button>
      </div>

      {expanded && (
        <div style={styles.popup}>
          {goal && (
            <>
              {goal.objectives?.length > 0 && (
                <div style={styles.block}>
                  <div style={styles.blockTitle}>읽으면서 확인할 것</div>
                  {goal.objectives.map((item, index) => (
                    <div key={index} style={styles.item}>{item}</div>
                  ))}
                </div>
              )}
              {goal.focusQuestions?.length > 0 && (
                <div style={styles.block}>
                  <div style={styles.blockTitle}>사고 질문</div>
                  {goal.focusQuestions.map((item, index) => (
                    <div key={index} style={styles.item}>{item}</div>
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
            <span style={styles.pageHint}>{pageNumber}p</span>
            {goal && (
              <button
                type="button"
                style={{ ...styles.actionBtn, ...(goal.completed ? styles.completeBtn : {}) }}
                onClick={() => runAction(onToggleComplete)}
                disabled={busyAction}
              >
                {goal.completed ? '완료 취소' : '완료'}
              </button>
            )}
            <button
              type="button"
              style={styles.actionBtn}
              onClick={() => runAction(onRegenerate)}
              disabled={busyAction || loading || unavailable}
            >
              다시 생성
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
    padding: '10px clamp(12px, 5vw, 56px)',
    background: '#eeeeee',
    borderBottom: '1px solid #d8d8d8',
    zIndex: 18,
    pointerEvents: 'none',
  },
  card: {
    width: 'min(760px, 100%)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.94)',
    border: '1px solid rgba(40,40,40,0.12)',
    boxShadow: '0 6px 22px rgba(0,0,0,0.14)',
    color: '#202124',
    pointerEvents: 'auto',
    overflow: 'hidden',
  },
  cardDone: {
    opacity: 0.78,
  },
  summary: {
    width: '100%',
    minHeight: 42,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
  },
  badge: {
    flexShrink: 0,
    padding: '3px 8px',
    borderRadius: 999,
    background: '#eef2ff',
    color: '#4f46e5',
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  label: {
    marginRight: 8,
    color: '#111827',
  },
  mainText: {
    flex: 1,
    minWidth: 0,
    color: '#333',
    fontSize: 13,
    fontWeight: 600,
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
    color: '#6b7280',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  popup: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 24px)',
    maxWidth: 760,
    maxHeight: 'min(56vh, 440px)',
    overflowY: 'auto',
    border: '1px solid rgba(40,40,40,0.12)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.98)',
    boxShadow: '0 14px 34px rgba(0,0,0,0.22)',
    padding: '10px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    pointerEvents: 'auto',
  },
  block: {
    display: 'grid',
    gap: 5,
  },
  blockTitle: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: 800,
  },
  item: {
    color: '#2d2d2d',
    fontSize: 12,
    lineHeight: 1.45,
  },
  keywords: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  keyword: {
    padding: '3px 7px',
    borderRadius: 999,
    background: '#f3f4f6',
    color: '#4b5563',
    fontSize: 11,
    fontWeight: 700,
  },
  error: {
    color: '#b42318',
    background: '#fff3f0',
    borderRadius: 6,
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
    border: '1px solid #d8d8d8',
    background: '#fff',
    color: '#333',
    borderRadius: 7,
    padding: '5px 9px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  completeBtn: {
    background: '#ecfdf3',
    borderColor: '#abefc6',
    color: '#067647',
  },
}
