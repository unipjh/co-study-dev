import { useEffect, useMemo, useRef, useState } from 'react'
import useAI from '../AI/useAI'
import useDocumentIndex from '../../hooks/useDocumentIndex'
import useQuizSessions from '../../hooks/useQuizSessions'
import useLearningQuestionAnswers from '../../hooks/useLearningQuestionAnswers'
import { stableHash } from '../../lib/studyIds'
import {
  buildQuizHistory,
  filterNovelQuizItems,
  selectQuizSourceChunks,
} from '../../lib/quizDiversity'

const NAVY = '#070761'
const LAVENDER = '#eeeef8'

const SCOPE_OPTIONS = [
  { key: 'page', label: '현재 페이지' },
  { key: 'all', label: '전체 페이지' },
  { key: 'memo', label: '저장 메모' },
  { key: 'selection', label: '선택 텍스트' },
]

const REVIEW_OPTIONS = [
  { key: 'wrong', label: '틀린 문제' },
  { key: 'correct', label: '맞힌 문제' },
]

export default function QuizPanel({ docId, annotations = [], currentPage = 1, quizSeed, onSendToChat }) {
  const { generateQuizItems } = useAI()
  const { indexed, indexing, getChunkByPage, getAllChunks } = useDocumentIndex(docId)
  const { sessions, saveSession } = useQuizSessions(docId)
  const { answers: popupQuestionAnswers } = useLearningQuestionAnswers(docId)

  const [scope, setScope] = useState('page')
  const [selectionText, setSelectionText] = useState('')
  const [items, setItems] = useState([])
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [generationNotice, setGenerationNotice] = useState(null)
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [reviewFilter, setReviewFilter] = useState(null)
  const savedQuizListRef = useRef(null)
  const savedQuizDragRef = useRef({ suppressClick: false })

  useEffect(() => {
    if (!quizSeed) return
    if (quizSeed.scope === 'selection') {
      setScope('selection')
      setSelectionText(quizSeed.text ?? '')
    } else if (quizSeed.scope === 'page') {
      setScope('page')
    } else if (quizSeed.scope === 'memo') {
      setScope('memo')
    }
    setReviewFilter(null)
    setGenerationNotice(null)
  }, [quizSeed?.requestId])

  const memoText = useMemo(() => {
    return annotations
      .filter((ann) => ann.content || ann.text)
      .map((ann) => {
        const page = ann.pageIndex != null ? `${ann.pageIndex + 1}p` : '?p'
        const source = ann.text ? `원문: ${ann.text}` : ''
        const memo = ann.content ? `메모: ${ann.content}` : ''
        return `[${page}]\n${source}\n${memo}`.trim()
      })
      .join('\n\n')
  }, [annotations])

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )

  const reviewEntries = useMemo(() => {
    return sessions.flatMap((session) => {
      return (session.items ?? []).map((item, index) => {
        const value = session.answers?.[item.id] ?? ''
        const itemRevealed = !!session.revealed?.[item.id]
        return {
          item,
          index,
          session,
          value,
          revealed: itemRevealed,
          status: getItemStatus(item, value, itemRevealed),
        }
      })
    })
  }, [sessions])

  const popupQuizEntries = useMemo(() => {
    return popupQuestionAnswers
      .filter((answer) => {
        const correctAnswer = String(answer.correctAnswer ?? '').toUpperCase()
        return answer.question && (correctAnswer === 'O' || correctAnswer === 'X')
      })
      .sort((a, b) => getTimeMs(b.updatedAt ?? b.createdAt) - getTimeMs(a.updatedAt ?? a.createdAt))
      .map((answer, index) => {
        const correctAnswer = String(answer.correctAnswer ?? '').toUpperCase()
        const selectedAnswer = ['O', 'X'].includes(String(answer.selectedAnswer ?? '').toUpperCase())
          ? String(answer.selectedAnswer).toUpperCase()
          : ''
        const pageNumber = Number.isFinite(answer.pageIndex) ? answer.pageIndex + 1 : null
        return {
          item: {
            id: `popup_${answer.id}`,
            type: 'ox',
            question: answer.question,
            answer: correctAnswer,
            explanation: answer.explanation || '',
          },
          index,
          session: {
            id: `popup_${answer.id}`,
            scope: 'popup_ox',
            scopeLabel: '팝업O/X퀴즈',
            pageNumber,
          },
          value: selectedAnswer,
          revealed: true,
          status: answer.status === 'skipped' ? 'skipped' : getItemStatus({ answer: correctAnswer }, selectedAnswer, true),
          popupAnswer: answer,
        }
      })
  }, [popupQuestionAnswers])

  const reviewCounts = useMemo(() => {
    return reviewEntries.reduce((acc, entry) => {
      if (entry.status === 'wrong') acc.wrong += 1
      if (entry.status === 'correct') acc.correct += 1
      return acc
    }, { wrong: 0, correct: 0 })
  }, [reviewEntries])

  const visibleEntries = useMemo(() => {
    if (reviewFilter === 'popup_ox') {
      return popupQuizEntries
    }

    if (reviewFilter) {
      return reviewEntries.filter((entry) => entry.status === reviewFilter)
    }

    return items.map((item, index) => ({
      item,
      index,
      session: activeSession,
      value: answers[item.id] ?? '',
      revealed: !!revealed[item.id],
      status: getItemStatus(item, answers[item.id], !!revealed[item.id]),
    }))
  }, [activeSession, answers, items, popupQuizEntries, revealed, reviewEntries, reviewFilter])

  useEffect(() => {
    if (loading || sessions.length === 0) return
    if (activeSessionId && sessions.some((session) => session.id === activeSessionId)) return
    loadSession(sessions[0], { keepReviewFilter: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, loading, sessions])

  function getScopeText() {
    if (scope === 'selection') return selectionText.trim()
    if (scope === 'memo') return memoText.trim()
    if (scope === 'all') {
      return getAllChunks()
        .map((chunk) => `[${chunk.pageIndex + 1}페이지]\n${chunk.text}`)
        .join('\n\n')
        .trim()
    }

    const pageIndex = Math.max(0, currentPage - 1)
    const chunk = getChunkByPage(pageIndex)
    return chunk?.text?.trim() ?? ''
  }

  function getScopeSourcePackage(history = null) {
    if (scope === 'all') {
      const chunks = getAllChunks()
      const fullText = chunks
        .map((chunk) => `[${chunk.pageIndex + 1}페이지]\n${chunk.text}`)
        .join('\n\n')
        .trim()
      const selected = selectQuizSourceChunks(chunks, { history })
      return {
        text: selected.text,
        sourceTextHash: stableHash(fullText),
        sourcePageIndexes: selected.pageIndexes,
      }
    }

    const text = getScopeText()
    return {
      text,
      sourceTextHash: stableHash(text),
      sourcePageIndexes: scope === 'page' ? [Math.max(0, currentPage - 1)] : [],
    }
  }

  function getScopeLabel() {
    if (scope === 'selection') return '선택 텍스트'
    if (scope === 'memo') return '저장된 메모'
    if (scope === 'all') return '전체 페이지'
    return `${currentPage}페이지`
  }

  async function handleGenerate() {
    const text = getScopeText()
    if (!text) {
      setError((scope === 'page' || scope === 'all') && !indexed
        ? '페이지 색인이 끝난 뒤 퀴즈를 만들 수 있습니다.'
        : '퀴즈를 만들 내용이 없습니다.')
      return
    }

    setLoading(true)
    setError(null)
    setGenerationNotice(null)
    setReviewFilter(null)
    setItems([])
    setAnswers({})
    setRevealed({})
    try {
      const initialHistory = buildQuizHistory(sessions, {
        scope,
        sourceTextHash: stableHash(text),
        pageNumber: currentPage,
      })
      const sourcePackage = getScopeSourcePackage(initialHistory)
      const history = buildQuizHistory(sessions, {
        scope,
        sourceTextHash: sourcePackage.sourceTextHash,
        pageNumber: currentPage,
      })
      const result = await generateQuizItems(sourcePackage.text, getScopeLabel(), {
        history,
        sourcePageIndexes: sourcePackage.sourcePageIndexes,
        generationIndex: history.sessionCount + 1,
      })
      const filtered = filterNovelQuizItems(result, history.items)
      if (!filtered.items.length) throw new Error('이전 퀴즈와 겹치지 않는 새 문항을 만들지 못했습니다. 범위를 바꾸거나 잠시 후 다시 시도해 주세요.')
      if (filtered.items.length < 4 || filtered.rejectedCount > 0) {
        setGenerationNotice(filtered.items.length < 4
          ? '이전 퀴즈와 겹치는 문항을 제외해 새 관점 문항만 표시합니다.'
          : '이전 퀴즈와 유사한 후보 문항을 제외하고 새 문항으로 구성했습니다.')
      }
      const saved = await saveSession({
        scope,
        scopeLabel: getScopeLabel(),
        pageNumber: scope === 'page' ? currentPage : null,
        sourceTextHash: sourcePackage.sourceTextHash,
        sourcePageIndexes: sourcePackage.sourcePageIndexes,
        generationIndex: history.sessionCount + 1,
        duplicateRejectedCount: filtered.rejectedCount,
        items: filtered.items,
        answers: {},
        revealed: {},
      })
      setItems(filtered.items)
      setActiveSessionId(saved?.id ?? null)
    } catch (err) {
      setError(err.message ?? '퀴즈 생성에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function handleAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  function reveal(id) {
    setRevealed((prev) => ({ ...prev, [id]: true }))
  }

  function loadSession(session, options = {}) {
    setActiveSessionId(session.id)
    setScope(session.scope ?? 'page')
    setItems(session.items ?? [])
    setAnswers(session.answers ?? {})
    setRevealed(session.revealed ?? {})
    setError(null)
    setGenerationNotice(null)
    if (!options.keepReviewFilter) setReviewFilter(null)
  }

  function handleSavedQuizDragStart(event) {
    const rail = savedQuizListRef.current
    if (!rail || rail.scrollWidth <= rail.clientWidth) return

    const state = {
      startX: event.clientX,
      scrollLeft: rail.scrollLeft,
      moved: false,
    }
    savedQuizDragRef.current.suppressClick = false
    rail.style.cursor = 'grabbing'

    function handleMove(moveEvent) {
      const dx = moveEvent.clientX - state.startX
      if (Math.abs(dx) > 4) state.moved = true
      rail.scrollLeft = state.scrollLeft - dx
    }

    function handleUp() {
      rail.style.cursor = ''
      savedQuizDragRef.current.suppressClick = state.moved
      window.setTimeout(() => {
        savedQuizDragRef.current.suppressClick = false
      }, 0)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  function handleSavedQuizClick(event, session) {
    if (savedQuizDragRef.current.suppressClick) {
      event.preventDefault()
      return
    }
    loadSession(session)
  }

  useEffect(() => {
    if (!activeSessionId || reviewFilter) return
    const current = sessions.find((session) => session.id === activeSessionId)
    if (!current || items.length === 0) return
    saveSession({
      ...current,
      items,
      answers,
      revealed,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, revealed])

  function sendQuestionToChat(item, value = answers[item.id] ?? '', pageIndex = currentPage - 1) {
    onSendToChat?.({
      id: `quiz_${Date.now()}`,
      type: 'quiz',
      color: 'blue',
      pageIndex,
      text: item.question,
      content: `내 답: ${value || '(아직 없음)'}\n정답: ${item.answer}\n해설: ${item.explanation}`,
      transient: true,
    })
  }

  const pageUnavailable = (scope === 'page' || scope === 'all') && !indexed
  const emptyMessage = getEmptyMessage({ reviewFilter, loading, error })

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>퀴즈</h2>
      </div>

      <div style={styles.controls}>
        <div style={styles.segmented}>
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              style={{ ...styles.segmentBtn, ...(scope === option.key ? styles.segmentBtnActive : {}) }}
              onClick={() => {
                setScope(option.key)
                setReviewFilter(null)
                setGenerationNotice(null)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {scope === 'selection' && (
          <textarea
            style={styles.selectionInput}
            value={selectionText}
            onChange={(e) => setSelectionText(e.target.value)}
            placeholder="퀴즈로 만들 선택 텍스트를 입력하거나, PDF에서 텍스트 선택 후 Quiz를 누르세요."
            rows={4}
          />
        )}

        {scope === 'memo' && annotations.length === 0 && (
          <p style={styles.notice}>저장된 메모가 아직 없습니다.</p>
        )}
        {pageUnavailable && (
          <p style={styles.notice}>{indexing ? '페이지 색인 중입니다.' : '페이지 색인이 필요합니다.'}</p>
        )}
        {generationNotice && (
          <p style={styles.notice}>{generationNotice}</p>
        )}

        <button
          type="button"
          style={{ ...styles.generateBtn, opacity: loading ? 0.55 : 1 }}
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? '생성 중...' : '퀴즈 생성'}
        </button>
      </div>

      <div style={styles.filters}>
        <div style={styles.filterGroup}>
          <p style={styles.filterTitle}>저장된 퀴즈</p>
          <div
            ref={savedQuizListRef}
            style={{ ...styles.chipList, ...styles.savedQuizRail }}
            onMouseDown={handleSavedQuizDragStart}
          >
            {sessions.length === 0 && popupQuizEntries.length === 0 && <span style={styles.emptyChip}>아직 없음</span>}
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                style={{
                  ...styles.chip,
                  ...(session.id === activeSessionId && !reviewFilter ? styles.chipActive : {}),
                }}
                onClick={(event) => handleSavedQuizClick(event, session)}
              >
                {formatSessionLabel(session)}
              </button>
            ))}
            {popupQuizEntries.length > 0 && (
              <button
                type="button"
                style={{
                  ...styles.chip,
                  ...(reviewFilter === 'popup_ox' ? styles.chipActive : {}),
                }}
                onClick={() => {
                  setReviewFilter((prev) => (prev === 'popup_ox' ? null : 'popup_ox'))
                }}
                aria-label={`팝업O/X퀴즈 ${popupQuizEntries.length}개`}
              >
                팝업O/X퀴즈
              </button>
            )}
          </div>
        </div>

        <div style={styles.filterDivider} />

        <div style={styles.filterGroup}>
          <p style={styles.filterTitle}>오답 노트</p>
          <div style={styles.chipList}>
            {REVIEW_OPTIONS.map((option) => {
              const count = option.key === 'popup_ox'
                ? popupQuizEntries.length
                : reviewCounts[option.key]
              return (
                <button
                  key={option.key}
                  type="button"
                  style={{
                    ...styles.chip,
                    ...(reviewFilter === option.key ? styles.chipActive : {}),
                    ...(count === 0 ? styles.chipDisabled : {}),
                  }}
                  onClick={() => {
                    setReviewFilter((prev) => (prev === option.key ? null : option.key))
                  }}
                  aria-label={`${option.label} ${count}개`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div style={styles.list}>
        {error && <p style={styles.error}>{error}</p>}
        {!error && visibleEntries.length === 0 && !loading && (
          <div style={styles.empty}>
            <p>{emptyMessage}</p>
          </div>
        )}

        {visibleEntries.map((entry) => {
          const isReadOnly = !!reviewFilter || (!!entry.session && entry.session.id !== activeSessionId)
          const canLoadSession = !!entry.session && entry.session.scope !== 'popup_ox'
          return (
            <QuizCard
              key={`${entry.session?.id ?? 'draft'}_${entry.item.id}`}
              item={entry.item}
              index={entry.index}
              value={entry.value}
              revealed={entry.revealed}
              sessionLabel={reviewFilter ? formatSessionLabel(entry.session) : null}
              readOnly={isReadOnly}
              canLoadSession={canLoadSession}
              onAnswer={(value) => handleAnswer(entry.item.id, value)}
              onReveal={() => reveal(entry.item.id)}
              onSendToChat={() => sendQuestionToChat(entry.item, entry.value, entry.popupAnswer?.pageIndex ?? currentPage - 1)}
              onLoadSession={() => entry.session && loadSession(entry.session)}
            />
          )
        })}
      </div>
    </div>
  )
}

function QuizCard({
  item,
  index,
  value,
  revealed,
  sessionLabel,
  readOnly,
  canLoadSession,
  onAnswer,
  onReveal,
  onSendToChat,
  onLoadSession,
}) {
  const status = getItemStatus(item, value, revealed)

  return (
    <section style={styles.card}>
      <div style={styles.cardTop}>
        <span style={styles.index}>{index + 1}</span>
        {sessionLabel && <span style={styles.sessionMeta}>{sessionLabel}</span>}
      </div>
      <p style={styles.question}>{item.question}</p>

      {item.type === 'multiple_choice' && (
        <div style={styles.choices}>
          {item.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              style={getChoiceStyle({ choice, item, value, revealed })}
              onClick={() => onAnswer(choice)}
              disabled={readOnly}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {item.type === 'ox' && (
        <div style={styles.choicesRow}>
          {['O', 'X'].map((choice) => (
            <button
              key={choice}
              type="button"
              style={getChoiceStyle({ choice, item, value, revealed, base: styles.oxBtn })}
              onClick={() => onAnswer(choice)}
              disabled={readOnly}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {item.type === 'short_answer' && (
        <input
          style={styles.shortInput}
          value={value}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="답을 입력하세요"
          disabled={readOnly}
        />
      )}

      <div style={styles.cardActions}>
        {readOnly ? (
          canLoadSession ? (
            <button type="button" style={styles.secondaryBtn} onClick={onLoadSession}>이 퀴즈 열기</button>
          ) : null
        ) : (
          <button type="button" style={styles.primarySmallBtn} onClick={onReveal}>정답 확인</button>
        )}
        <button type="button" style={styles.secondaryBtn} onClick={onSendToChat}>질문에 추가</button>
      </div>

      {revealed && (
        <div style={{ ...styles.explanation, ...(status === 'correct' ? styles.correctExplanation : {}) }}>
          <strong>정답: {item.answer}</strong>
          <p>{item.explanation}</p>
        </div>
      )}
    </section>
  )
}

function getChoiceStyle({ choice, item, value, revealed, base = styles.choiceBtn }) {
  const selected = String(value) === String(choice)
  const correct = normalizeAnswer(choice) === normalizeAnswer(item.answer)
  const wrongSelected = revealed && selected && !correct
  const correctVisible = revealed && correct

  return {
    ...base,
    ...(selected ? styles.choiceSelected : {}),
    ...(correctVisible ? styles.choiceCorrect : {}),
    ...(wrongSelected ? styles.choiceWrong : {}),
  }
}

function getItemStatus(item, value, revealed) {
  if (!revealed) return 'pending'
  return normalizeAnswer(value) === normalizeAnswer(item.answer) ? 'correct' : 'wrong'
}

function normalizeAnswer(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function formatSessionLabel(session) {
  if (!session) return '퀴즈'
  if (session.scope === 'popup_ox') {
    return session.pageNumber ? `팝업O/X퀴즈 · ${session.pageNumber}페이지` : '팝업O/X퀴즈'
  }
  const base = session.pageNumber ? `${session.pageNumber}페이지` : (session.scopeLabel || scopeFallback(session.scope))
  return session.generationIndex > 1 ? `${base} ${session.generationIndex}회차` : base
}

function scopeFallback(scope) {
  if (scope === 'all') return '전체 페이지'
  if (scope === 'memo') return '저장 메모'
  if (scope === 'selection') return '선택 텍스트'
  return '퀴즈'
}

function getEmptyMessage({ reviewFilter, loading, error }) {
  if (loading || error) return ''
  if (reviewFilter === 'wrong') return '아직 틀린 문제가 없습니다.'
  if (reviewFilter === 'correct') return '아직 맞힌 문제가 없습니다.'
  if (reviewFilter === 'popup_ox') return '아직 저장된 팝업 O/X 퀴즈가 없습니다.'
  return '범위를 고른 뒤 퀴즈를 생성하세요.'
}

function getTimeMs(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const styles = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#ffffff',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 28px 16px',
    borderBottom: '1px solid #eeeeee',
    background: '#fff',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    color: '#000000',
    fontSize: 22,
    lineHeight: '28px',
    fontWeight: 800,
  },
  controls: {
    padding: '18px 28px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderBottom: '1px solid #eeeeee',
    background: '#fff',
    flexShrink: 0,
  },
  segmented: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 3,
    padding: 3,
    borderRadius: 5,
    background: LAVENDER,
  },
  segmentBtn: {
    minWidth: 0,
    border: 'none',
    borderRadius: 5,
    background: 'transparent',
    color: '#000000',
    padding: '8px 3px',
    fontSize: 11,
    lineHeight: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  segmentBtnActive: {
    background: NAVY,
    color: '#ffffff',
  },
  selectionInput: {
    resize: 'vertical',
    minHeight: 74,
    border: '1px solid rgba(0,0,0,0.2)',
    borderRadius: 5,
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    lineHeight: 1.5,
    outline: 'none',
  },
  notice: {
    margin: 0,
    color: '#6e6e6e',
    background: '#f8f8fc',
    border: '1px solid rgba(7,7,97,0.12)',
    borderRadius: 5,
    padding: '7px 9px',
    fontSize: 12,
  },
  generateBtn: {
    border: 'none',
    borderRadius: 5,
    background: NAVY,
    color: '#fff',
    padding: '9px 12px',
    fontSize: 15,
    lineHeight: '20px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  filters: {
    display: 'grid',
    gridTemplateColumns: '1fr 1px 1fr',
    gap: 16,
    padding: '18px 28px',
    borderBottom: '1px solid #eeeeee',
    background: '#ffffff',
    flexShrink: 0,
  },
  filterGroup: {
    minWidth: 0,
  },
  filterTitle: {
    margin: '0 0 11px',
    color: '#484848',
    fontSize: 15,
    lineHeight: '20px',
    fontWeight: 800,
    textAlign: 'center',
  },
  filterDivider: {
    background: '#eeeeee',
    minHeight: 56,
  },
  chipList: {
    display: 'flex',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  savedQuizRail: {
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '2px 2px 7px',
    cursor: 'grab',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'thin',
    userSelect: 'none',
  },
  chip: {
    border: 'none',
    borderRadius: 5,
    background: LAVENDER,
    color: NAVY,
    minHeight: 25,
    padding: '3px 10px',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  },
  chipActive: {
    background: 'rgba(7,7,97,0.5)',
    color: '#ffffff',
  },
  chipDisabled: {
    opacity: 0.58,
  },
  emptyChip: {
    minHeight: 25,
    display: 'inline-flex',
    alignItems: 'center',
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: 700,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '18px 28px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    background: '#ffffff',
  },
  empty: {
    minHeight: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
  },
  error: {
    margin: 0,
    color: '#b42318',
    background: '#fff3f0',
    borderRadius: 5,
    padding: '9px 10px',
    fontSize: 12,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 13,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  index: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: LAVENDER,
    color: NAVY,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 900,
  },
  sessionMeta: {
    color: '#6e6e6e',
    fontSize: 12,
    fontWeight: 800,
  },
  question: {
    margin: '2px 0 0',
    color: '#000000',
    fontSize: 18,
    lineHeight: '24px',
    fontWeight: 800,
  },
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: 11,
  },
  choicesRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  choiceBtn: {
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#ffffff',
    color: '#484848',
    borderRadius: 5,
    minHeight: 38,
    padding: '8px 15px',
    textAlign: 'left',
    fontSize: 16,
    lineHeight: '20px',
    cursor: 'pointer',
  },
  oxBtn: {
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#ffffff',
    color: '#484848',
    borderRadius: 5,
    minHeight: 38,
    padding: '8px 15px',
    textAlign: 'center',
    fontSize: 16,
    lineHeight: '20px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  choiceSelected: {
    borderColor: '#111111',
    background: 'rgba(4,217,0,0.25)',
    color: '#000000',
  },
  choiceCorrect: {
    borderColor: '#111111',
    background: 'rgba(4,217,0,0.25)',
    color: '#000000',
  },
  choiceWrong: {
    borderColor: '#d92d20',
    background: '#fff1f0',
    color: '#7a271a',
  },
  shortInput: {
    border: '1px solid rgba(0,0,0,0.2)',
    borderRadius: 5,
    minHeight: 38,
    padding: '8px 15px',
    fontSize: 16,
    outline: 'none',
  },
  cardActions: {
    display: 'flex',
    gap: 11,
    flexWrap: 'wrap',
  },
  primarySmallBtn: {
    border: 'none',
    background: NAVY,
    color: '#ffffff',
    borderRadius: 5,
    minHeight: 38,
    padding: '8px 15px',
    fontSize: 16,
    lineHeight: '20px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryBtn: {
    border: 'none',
    background: LAVENDER,
    color: NAVY,
    borderRadius: 5,
    minHeight: 38,
    padding: '8px 15px',
    fontSize: 16,
    lineHeight: '20px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  explanation: {
    margin: '0 -28px',
    background: LAVENDER,
    borderLeft: '1px solid rgba(7,7,97,0.18)',
    color: '#6e6e6e',
    padding: '22px 44px',
    fontSize: 17,
    lineHeight: 1.5,
  },
  correctExplanation: {
    background: '#f0fff4',
  },
}
