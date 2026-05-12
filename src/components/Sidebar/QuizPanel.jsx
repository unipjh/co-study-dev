import { useEffect, useMemo, useState } from 'react'
import useAI from '../AI/useAI'
import useDocumentIndex from '../../hooks/useDocumentIndex'

const SCOPE_OPTIONS = [
  { key: 'page', label: '현재 페이지' },
  { key: 'memo', label: '저장 메모' },
  { key: 'selection', label: '선택 텍스트' },
]

export default function QuizPanel({ docId, annotations = [], currentPage = 1, quizSeed, onSendToChat }) {
  const { generateQuizItems } = useAI()
  const { indexed, indexing, getChunkByPage } = useDocumentIndex(docId)

  const [scope, setScope] = useState('page')
  const [selectionText, setSelectionText] = useState('')
  const [items, setItems] = useState([])
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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

  function getScopeText() {
    if (scope === 'selection') return selectionText.trim()
    if (scope === 'memo') return memoText.trim()

    const pageIndex = Math.max(0, currentPage - 1)
    const chunk = getChunkByPage(pageIndex)
    return chunk?.text?.trim() ?? ''
  }

  function getScopeLabel() {
    if (scope === 'selection') return '선택 텍스트'
    if (scope === 'memo') return '저장된 메모'
    return `${currentPage}페이지`
  }

  async function handleGenerate() {
    const text = getScopeText()
    if (!text) {
      setError(scope === 'page' && !indexed
        ? '페이지 색인이 끝난 뒤 퀴즈를 만들 수 있습니다.'
        : '퀴즈를 만들 내용이 없습니다.')
      return
    }

    setLoading(true)
    setError(null)
    setItems([])
    setAnswers({})
    setRevealed({})
    try {
      const result = await generateQuizItems(text, getScopeLabel())
      if (!result.length) throw new Error('생성된 문항이 없습니다.')
      setItems(result)
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

  function sendQuestionToChat(item) {
    onSendToChat?.({
      id: `quiz_${Date.now()}`,
      type: 'quiz',
      color: 'blue',
      pageIndex: currentPage - 1,
      text: item.question,
      content: `내 답: ${answers[item.id] || '(아직 없음)'}\n정답: ${item.answer}\n해설: ${item.explanation}`,
      transient: true,
    })
  }

  const pageUnavailable = scope === 'page' && !indexed

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Quiz</h2>
          <p style={styles.subtitle}>읽은 범위를 바로 점검합니다.</p>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.segmented}>
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              style={{ ...styles.segmentBtn, ...(scope === option.key ? styles.segmentBtnActive : {}) }}
              onClick={() => setScope(option.key)}
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

        <button
          type="button"
          style={{ ...styles.generateBtn, opacity: loading ? 0.55 : 1 }}
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? '생성 중...' : '퀴즈 생성'}
        </button>
      </div>

      <div style={styles.list}>
        {error && <p style={styles.error}>{error}</p>}
        {!error && items.length === 0 && !loading && (
          <div style={styles.empty}>
            <p>범위를 고른 뒤 퀴즈를 생성하세요.</p>
          </div>
        )}

        {items.map((item, index) => (
          <QuizCard
            key={item.id}
            item={item}
            index={index}
            value={answers[item.id] ?? ''}
            revealed={!!revealed[item.id]}
            onAnswer={(value) => handleAnswer(item.id, value)}
            onReveal={() => reveal(item.id)}
            onSendToChat={() => sendQuestionToChat(item)}
          />
        ))}
      </div>
    </div>
  )
}

function QuizCard({ item, index, value, revealed, onAnswer, onReveal, onSendToChat }) {
  const normalizedValue = String(value).trim()
  const isCorrect = revealed && normalizedValue && normalizedValue.toLowerCase() === item.answer.toLowerCase()

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <span style={styles.index}>{index + 1}</span>
        <span style={styles.type}>{typeLabel(item.type)}</span>
      </div>
      <p style={styles.question}>{item.question}</p>

      {item.type === 'multiple_choice' && (
        <div style={styles.choices}>
          {item.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              style={{ ...styles.choiceBtn, ...(value === choice ? styles.choiceSelected : {}) }}
              onClick={() => onAnswer(choice)}
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
              style={{ ...styles.oxBtn, ...(value === choice ? styles.choiceSelected : {}) }}
              onClick={() => onAnswer(choice)}
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
        />
      )}

      <div style={styles.cardActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onReveal}>정답 확인</button>
        <button type="button" style={styles.secondaryBtn} onClick={onSendToChat}>Chat에 보내기</button>
      </div>

      {revealed && (
        <div style={{ ...styles.explanation, ...(isCorrect ? styles.correct : {}) }}>
          <strong>정답: {item.answer}</strong>
          <p>{item.explanation}</p>
        </div>
      )}
    </div>
  )
}

function typeLabel(type) {
  if (type === 'multiple_choice') return '객관식'
  if (type === 'ox') return 'OX'
  return '단답형'
}

const styles = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#fafafa',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 16px 10px',
    borderBottom: '1px solid #eeeeee',
    background: '#fff',
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: 18, color: '#1f2937' },
  subtitle: { margin: '4px 0 0', fontSize: 12, color: '#6b7280' },
  controls: {
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    borderBottom: '1px solid #eeeeee',
    background: '#fff',
    flexShrink: 0,
  },
  segmented: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 4,
    padding: 3,
    borderRadius: 8,
    background: '#f3f4f6',
  },
  segmentBtn: {
    minWidth: 0,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: '#4b5563',
    padding: '7px 6px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  segmentBtnActive: {
    background: '#fff',
    color: '#111827',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  selectionInput: {
    resize: 'vertical',
    minHeight: 80,
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    lineHeight: 1.5,
    outline: 'none',
  },
  notice: {
    margin: 0,
    color: '#6b7280',
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: 7,
    padding: '7px 8px',
    fontSize: 12,
  },
  generateBtn: {
    border: 'none',
    borderRadius: 8,
    background: '#1f2937',
    color: '#fff',
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
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
    borderRadius: 8,
    padding: '9px 10px',
    fontSize: 12,
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  cardTop: { display: 'flex', alignItems: 'center', gap: 7 },
  index: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#eef2ff',
    color: '#4f46e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 900,
  },
  type: { color: '#6b7280', fontSize: 11, fontWeight: 800 },
  question: { margin: 0, color: '#111827', fontSize: 14, lineHeight: 1.45, fontWeight: 700 },
  choices: { display: 'flex', flexDirection: 'column', gap: 6 },
  choicesRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  choiceBtn: {
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#374151',
    borderRadius: 7,
    padding: '8px 9px',
    textAlign: 'left',
    fontSize: 12,
    lineHeight: 1.35,
    cursor: 'pointer',
  },
  oxBtn: {
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#374151',
    borderRadius: 7,
    padding: '9px',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
  },
  choiceSelected: {
    borderColor: '#6366f1',
    background: '#eef2ff',
    color: '#312e81',
  },
  shortInput: {
    border: '1px solid #e5e7eb',
    borderRadius: 7,
    padding: '8px 9px',
    fontSize: 13,
    outline: 'none',
  },
  cardActions: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  secondaryBtn: {
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#374151',
    borderRadius: 7,
    padding: '6px 9px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  explanation: {
    borderRadius: 7,
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
    color: '#374151',
    padding: '8px 9px',
    fontSize: 12,
    lineHeight: 1.5,
  },
  correct: {
    background: '#ecfdf3',
    borderColor: '#abefc6',
  },
}
