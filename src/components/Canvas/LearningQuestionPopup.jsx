import { useEffect, useMemo, useState } from 'react'
import useLearningQuestionAnswers, { getGateQuestions } from '../../hooks/useLearningQuestionAnswers'

export default function LearningQuestionPopup({
  docId,
  unit,
  pageIndex,
  targetPage,
  mode = 'review',
  questionGateEnabled,
  onClose,
  onTurnOffGate,
  onMoveAfterResolved,
  onAskChat,
}) {
  const { getAnswer, saveAnswer, unresolvedQuestions } = useLearningQuestionAnswers(docId)
  const questions = useMemo(() => getGateQuestions(unit, pageIndex).slice(0, 2), [unit, pageIndex])
  const pending = useMemo(() => unresolvedQuestions(unit, pageIndex), [unit, pageIndex, unresolvedQuestions])
  const firstPending = pending[0] ?? questions[0] ?? null
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(null)
  }, [firstPending?.statement])

  if (!unit?.id || questions.length === 0 || !firstPending) return null

  const isBlocking = mode === 'blocked'
  const saved = getAnswer(unit.id, firstPending.statement)
  const chosen = selected ?? saved?.selectedAnswer ?? null
  const correctAnswer = firstPending.answer === 'X' ? 'X' : 'O'
  const isCorrect = chosen ? chosen === correctAnswer : null
  const title = '잠깐, 이해하고 있나요?'
  const description = '지금까지 읽은 내용을 바탕으로 간단한 O/X 퀴즈를 풀어보세요.'

  async function choose(answer) {
    setSelected(answer)
    setSaving(true)
    try {
      await saveAnswer({
        unitId: unit.id,
        pageIndex,
        question: firstPending.statement,
        answer,
        selectedAnswer: answer,
        correctAnswer,
        isCorrect: answer === correctAnswer,
        explanation: firstPending.explanation,
        status: 'answered',
      })
      if (isBlocking && targetPage) {
        onMoveAfterResolved?.()
      }
    } finally {
      setSaving(false)
    }
  }

  async function skip() {
    setSaving(true)
    try {
      await saveAnswer({
        unitId: unit.id,
        pageIndex,
        question: firstPending.statement,
        answer: 'skip',
        status: 'skipped',
        explanation: firstPending.explanation,
      })
      if (targetPage) onMoveAfterResolved?.()
      else onClose?.()
    } finally {
      setSaving(false)
    }
  }

  function askChat() {
    onAskChat?.(`다음 O/X 점검 문항을 쉽게 설명해줘.\n\n문항: ${firstPending.statement}\n정답: ${correctAnswer}\n해설: ${firstPending.explanation || '(없음)'}`)
  }

  return (
    <div style={styles.backdrop}>
      <section style={styles.popup} role="dialog" aria-label={title}>
        <div style={styles.header}>
          <h2 style={styles.title}>🖐🏻 {title}</h2>
          <p style={styles.description}>{description}</p>
          <button type="button" style={styles.closeBtn} onClick={onClose} aria-label="점검 팝업 닫기">×</button>
        </div>

        <div style={styles.questionBox}>
          <p style={styles.statement}>{firstPending.statement}</p>
        </div>

        <div style={styles.choiceGrid}>
          {['O', 'X'].map((answer) => (
            <button
              key={answer}
              type="button"
              style={{
                ...styles.choiceBtn,
                ...(chosen === answer ? styles.choiceBtnSelected : {}),
                ...(chosen === answer && isCorrect === false ? styles.choiceBtnWrong : {}),
              }}
              onClick={() => choose(answer)}
              disabled={saving}
            >
              {answer}
            </button>
          ))}
        </div>

        {chosen && !isBlocking && (
          <div style={isCorrect ? styles.feedbackOk : styles.feedbackNo}>
            <strong>{isCorrect ? '맞았어요.' : `정답은 ${correctAnswer}예요.`}</strong>
            {firstPending.explanation && <span>{firstPending.explanation}</span>}
          </div>
        )}

        <div style={styles.footer}>
          <button type="button" style={styles.secondaryBtn} onClick={skip} disabled={saving}>
            넘어가기
          </button>
          <button type="button" style={styles.secondaryBtn} onClick={askChat}>
            더 쉽게 설명
          </button>
          {questionGateEnabled && (
            <button type="button" style={styles.quietBtn} onClick={onTurnOffGate}>
              팝업 질문 끄기
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'absolute',
    inset: 0,
    zIndex: 42,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '84px 16px 96px',
    background: 'rgba(0,0,0,0.2)',
    backdropFilter: 'blur(2.5px)',
    pointerEvents: 'auto',
  },
  popup: {
    width: 'min(700px, 100%)',
    maxHeight: '100%',
    overflowY: 'auto',
    borderRadius: 10,
    background: '#ffffff',
    boxShadow: '0 24px 60px rgba(7,7,97,0.24)',
    padding: 'clamp(20px, 4vw, 34px) clamp(18px, 5vw, 46px) clamp(24px, 5vw, 42px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    paddingRight: 30,
  },
  title: {
    margin: 0,
    color: '#070761',
    fontSize: 'clamp(20px, 5vw, 25px)',
    lineHeight: '32px',
    fontWeight: 800,
  },
  description: {
    margin: 0,
    color: '#111111',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 400,
  },
  closeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 6,
    color: '#6e6e6e',
    fontSize: 18,
    fontWeight: 700,
  },
  questionBox: {
    minHeight: 62,
    borderRadius: 5,
    background: 'rgba(215,215,255,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '15px 22px',
  },
  statement: {
    margin: 0,
    color: '#111111',
    fontSize: 20,
    lineHeight: '28px',
    fontWeight: 800,
    textAlign: 'center',
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  choiceGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  choiceBtn: {
    height: 62,
    borderRadius: 5,
    border: '1px solid rgba(7,7,97,0.1)',
    background: '#ffffff',
    color: '#111111',
    fontSize: 20,
    fontWeight: 800,
  },
  choiceBtnSelected: {
    borderColor: '#070761',
    background: '#eeeef8',
    color: '#070761',
  },
  choiceBtnWrong: {
    borderColor: '#fca5a5',
    background: '#fff1f3',
    color: '#c01048',
  },
  feedbackOk: {
    display: 'grid',
    gap: 4,
    borderRadius: 5,
    background: '#ecfdf3',
    color: '#067647',
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: '20px',
  },
  feedbackNo: {
    display: 'grid',
    gap: 4,
    borderRadius: 5,
    background: '#fff7ed',
    color: '#9a3412',
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: '20px',
  },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  secondaryBtn: {
    minHeight: 34,
    borderRadius: 7,
    background: '#eeeef8',
    color: '#070761',
    padding: '0 13px',
    fontSize: 12,
    fontWeight: 900,
  },
  quietBtn: {
    minHeight: 34,
    borderRadius: 7,
    background: '#fff7ed',
    color: '#9a3412',
    border: '1px solid #fed7aa',
    padding: '0 13px',
    fontSize: 12,
    fontWeight: 900,
  },
}
