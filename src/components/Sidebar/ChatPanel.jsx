import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import useAI from '../AI/useAI'
import useChat from '../../hooks/useChat'
import useDocumentIndex from '../../hooks/useDocumentIndex'
import useLearningUnits from '../../hooks/useLearningUnits'
import useLearningQuestionAnswers from '../../hooks/useLearningQuestionAnswers'
import { getDisplayColor } from '../../lib/colorUtils'
import useDocumentStore from '../../store/documentStore'
import {
  buildContextPackage,
  classifyEvidenceStatus,
  composePrompt,
  formatSelectedContext,
  validateAIResponse,
} from '../../lib/ai/contextPipeline'

export default function ChatPanel({
  docId,
  contextAnnotations = [],
  onClearContext,
  currentPage = 0,
  pendingPrompt = null,
  onPendingPromptConsumed,
  onPageJump,
  focusSuggestedTick = 0,
  questionGateEnabled = true,
  onToggleQuestionGate,
}) {
  const { messages, addMessage } = useChat(docId)
  const { chat } = useAI()
  const { indexed, indexing, indexError, search, getChunkByPage } = useDocumentIndex(docId)
  const { getUnitForPage } = useLearningUnits(docId)
  const { getAnswer, saveAnswer } = useLearningQuestionAnswers(docId)

  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [suggestedOpen, setSuggestedOpen] = useState(() => localStorage.getItem('costudy:suggestedOpen') !== 'false')

  useEffect(() => {
    function handleFollowUpEvent(event) {
      const prompt = String(event.detail?.prompt ?? '').trim()
      if (!prompt) return
      handleSend(prompt)
    }

    window.addEventListener('costudy:chat-follow-up', handleFollowUpEvent)
    return () => window.removeEventListener('costudy:chat-follow-up', handleFollowUpEvent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [openQuestion, setOpenQuestion] = useState(null)
  const [draftAnswers, setDraftAnswers] = useState({})
  const [messageFilter, setMessageFilter] = useState('all')
  const bottomRef = useRef(null)
  const handledPromptRef = useRef(null)
  const suggestedRef = useRef(null)

  const noDoc = !docId
  const hasContext = contextAnnotations.length > 0
  const currentUnit = currentPage > 0 ? getUnitForPage(currentPage - 1) : null
  const suggestedQuestions = []
  const visibleMessages = messages.filter((message) => {
    if (messageFilter === 'all') return true
    if (messageFilter === 'context') return Boolean(message.contextText)
    if (messageFilter === 'followup') return /어떻게|추가|이어|그러면|그럼/.test(message.content ?? '')
    return !message.contextText
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (!pendingPrompt?.text) return
    if (handledPromptRef.current === pendingPrompt.id) return
    handledPromptRef.current = pendingPrompt.id
    handleSend(pendingPrompt.text)
    onPendingPromptConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt?.id])

  useEffect(() => {
    if (!focusSuggestedTick) return
    setSuggestedOpen(true)
    requestAnimationFrame(() => {
      suggestedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [focusSuggestedTick])

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim()
    if (!text || !docId || isStreaming) return

    setInput('')
    setError(null)
    setIsStreaming(true)
    setStreamingText('')

    try {
      const topChunks = await search(text)
      const currentPageChunk = currentPage > 0 ? getChunkByPage(currentPage - 1) : null
      const contextPackage = buildContextPackage({
        userText: text,
        intent: 'chat',
        semanticChunks: indexed ? topChunks : [],
        selectedContexts: contextAnnotations,
        currentPageChunk,
        getChunkByPage,
      })
      const contextText = formatSelectedContext(contextAnnotations)
      const { fullPrompt, systemInstruction, allowedPageNums } = composePrompt({
        userText: text,
        selectedContexts: contextAnnotations,
        contextPackage,
      })

      const imageParts = contextAnnotations
        .filter((annotation) => annotation.imageData)
        .map((annotation) => ({ inlineData: { data: annotation.imageData, mimeType: 'image/png' } }))

      await addMessage('user', text, contextText)

      const history = messages.map((message) => ({ role: message.role, content: message.content }))
      await chat(
        history,
        fullPrompt,
        (_, full) => setStreamingText(full),
        async (full) => {
          setStreamingText('')
          setIsStreaming(false)
          const checked = validateAIResponse(full, allowedPageNums, {
            hasEvidence: contextPackage.hasEvidence,
          })
          const evidenceStatus = classifyEvidenceStatus(checked, contextPackage)
          if (checked.warnings.length > 0 && import.meta.env.DEV) {
            console.warn('[ChatPanel] AI response validation warnings', {
              warnings: checked.warnings,
              evidenceStatus,
              allowedPages: [...allowedPageNums],
            })
          }
          await addMessage('assistant', checked.text, contextText, { evidenceStatus })
        },
        (errMsg) => {
          setError(errMsg)
          setIsStreaming(false)
          setStreamingText('')
        },
        imageParts,
        systemInstruction,
      )
    } catch (err) {
      setError(err.message ?? '오류가 발생했습니다.')
      setIsStreaming(false)
      setStreamingText('')
    }
  }

  async function handleQuickAction(key) {
    if (contextAnnotations.length === 0) return
    const prompts = {
      explain: '이 내용을 쉽게 설명해 줘.',
      quiz: '이 내용으로 퀴즈를 만들어 줘.',
    }
    await handleSend(prompts[key])
  }

  function toggleSuggestedOpen() {
    setSuggestedOpen((prev) => {
      localStorage.setItem('costudy:suggestedOpen', String(!prev))
      return !prev
    })
  }

  async function saveSuggestedAnswer(question, answer, status = 'answered') {
    if (!currentUnit?.id) return
    await saveAnswer({
      unitId: currentUnit.id,
      pageIndex: currentPage > 0 ? currentPage - 1 : null,
      question,
      answer,
      status,
    })
  }

  async function checkSuggestedAnswer(question) {
    const saved = getAnswer(currentUnit?.id, question)
    const answerText = saved?.answer?.trim() || '(빈 답변)'
    await handleSend(`다음 추천 질문에 대한 내 답변을 정답 관점에서 확인해줘.\n\n질문: ${question}\n내 답변: ${answerText}`)
  }

  function handlePageJump(page) {
    if (onPageJump && onPageJump(page) === false) return
    useDocumentStore.getState().setCurrentPage(page)
    useDocumentStore.getState().setViewMode('page')
  }

  function clearAllContext() {
    contextAnnotations.forEach((annotation) => onClearContext?.(annotation.id))
  }

  const contextPreview = hasContext ? getContextPreview(contextAnnotations) : null

  return (
    <div style={styles.panel}>
      <div style={styles.emptyContext} />

      {!noDoc && (indexing || indexError || !indexed) && (
        <div style={{ ...styles.indexNotice, ...(indexError ? styles.indexNoticeError : {}) }}>
          {indexError
            ? '문서 색인에 실패했습니다. 선택 맥락이나 일반 지식에 대해서만 답할 수 있습니다.'
            : indexing
              ? '문서 색인 중입니다. 완료 전에는 근거 검색이 제한될 수 있습니다.'
              : '문서 근거를 확인하는 중입니다.'}
        </div>
      )}

      {suggestedQuestions.length > 0 && (
        <section style={styles.suggestedQuestions} ref={suggestedRef}>
          <div style={styles.suggestedHeader}>
            <span style={styles.suggestedLabel}>추천 질문</span>
            <button
              type="button"
              style={styles.gateHeaderBtn}
              onClick={onToggleQuestionGate}
              title={`페이지 이동 제한 ${questionGateEnabled ? 'ON' : 'OFF'}`}
            >
              {questionGateEnabled ? 'ON' : 'OFF'}
            </button>
            <button type="button" style={styles.suggestedToggle} onClick={toggleSuggestedOpen}>
              {suggestedOpen ? '⌄' : '›'}
            </button>
          </div>
          {suggestedOpen && (
            <div style={styles.suggestedList}>
              {suggestedQuestions.map((question) => {
                const saved = getAnswer(currentUnit?.id, question)
                const isOpen = openQuestion === question
                const draft = draftAnswers[question] ?? saved?.answer ?? ''
                const resolved = saved?.status === 'answered' || saved?.status === 'skipped'
                return (
                  <div key={question} style={isOpen ? styles.suggestedCardOpen : styles.suggestedCard}>
                    <button
                      type="button"
                      style={styles.questionTextBtn}
                      onClick={() => setOpenQuestion(isOpen ? null : question)}
                      disabled={isStreaming || noDoc}
                      title="답변 작성 열기"
                    >
                      {question}
                    </button>
                    {isOpen && (
                      <div style={styles.answerBox}>
                        <textarea
                          style={styles.answerInput}
                          value={draft}
                          placeholder="내 답변을 먼저 적어보세요."
                          rows={3}
                          onChange={(event) => setDraftAnswers((prev) => ({ ...prev, [question]: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              saveSuggestedAnswer(question, draft.trim(), 'answered')
                            }
                          }}
                        />
                        <div style={styles.answerActions}>
                          <button type="button" style={styles.answerBtn} onClick={() => saveSuggestedAnswer(question, draft.trim(), 'answered')}>
                            저장
                          </button>
                          <button
                            type="button"
                            style={styles.answerGhostBtn}
                            onClick={() => saveSuggestedAnswer(question, ' ', 'skipped')}
                            disabled={isStreaming || saved?.status === 'skipped'}
                          >
                            Skip
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.answerGhostBtn, opacity: resolved ? 1 : 0.45 }}
                            disabled={!resolved || isStreaming}
                            onClick={() => checkSuggestedAnswer(question)}
                          >
                            AI로 확인
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <div style={styles.filterRow}>
        {[
          ['all', '전체'],
          ['simple', '단순'],
          ['followup', '꼬리'],
          ['context', '맥락'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            style={{ ...styles.filterBtn, ...(messageFilter === key ? styles.filterBtnActive : {}) }}
            onClick={() => setMessageFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={styles.messageList}>
        {noDoc && (
          <div style={styles.centerHint}>
            <p style={styles.hintText}>PDF를 열면 채팅을 시작할 수 있습니다.</p>
          </div>
        )}
        {visibleMessages.map((message) => (
          <MessageBubble key={message.id} message={message} onPageJump={handlePageJump} />
        ))}
        {isStreaming && streamingText && (
          <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
            <div style={{ ...styles.bubble, ...styles.assistantBubble }}>
              <div style={styles.assistantBubbleText}>
                <MarkdownContent onPageJump={handlePageJump}>{streamingText}</MarkdownContent>
                <span style={styles.cursor}>|</span>
              </div>
            </div>
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div style={{ ...styles.inputArea, ...(hasContext ? styles.inputAreaWithContext : {}) }}>
        {hasContext && (
          <>
            <div style={styles.composerContext}>
              <span style={styles.composerAccent} />
              <div style={styles.composerContextText}>
                <strong style={styles.composerContextTitle}>{contextPreview.title}</strong>
                <span style={styles.composerContextBody}>{contextPreview.body}</span>
              </div>
              <button
                type="button"
                style={styles.composerContextClose}
                onClick={clearAllContext}
                aria-label="선택 맥락 제거"
                title="선택 맥락 제거"
              >
                ×
              </button>
            </div>
            <div style={styles.composerDivider} />
          </>
        )}
        <div style={styles.composerRow}>
        <textarea
          style={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={noDoc ? 'PDF를 먼저 열어주세요.' : hasContext ? 'ㄴ  꼬리 질문을 입력하세요.' : '질문을 입력하세요.'}
          disabled={noDoc || isStreaming}
          rows={1}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: (noDoc || isStreaming) ? 0.4 : 1,
          }}
          onClick={() => handleSend()}
          disabled={noDoc || isStreaming || !input.trim()}
        >
          전송
        </button>
        </div>
      </div>
    </div>
  )
}

function getContextPreview(contextAnnotations) {
  const first = contextAnnotations[0]
  const titleBase = first?.type === 'region'
    ? first.imageData ? '선택 이미지 영역' : '선택 영역'
    : '선택 텍스트'
  const title = contextAnnotations.length > 1
    ? `${titleBase} 외 ${contextAnnotations.length - 1}개`
    : titleBase
  const body = first?.type === 'region'
    ? first.content || first.text || '이미지 영역이 맥락으로 추가되었습니다.'
    : first?.content || first?.text || '선택한 텍스트가 맥락으로 추가되었습니다.'
  return { title, body }
}

function processSourceMarkers(text) {
  return text.replace(/\[(?:p\.\s*\d+[\s,，、-]*)+\]/g, (match) => {
    const pages = [...match.matchAll(/\d+/g)].map((item) => item[0])
    return pages.map((page) => `[p.${page}](#page-${page})`).join(' ')
  })
}

function MarkdownContent({ children, onPageJump, followUpContext = '' }) {
  const processed = processSourceMarkers(children ?? '')
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children: paragraphChildren }) => <div style={{ margin: '0 0 6px', lineHeight: 1.6 }}>{paragraphChildren}</div>,
        ul: ({ children: listChildren }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{listChildren}</ul>,
        ol: ({ children: listChildren }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{listChildren}</ol>,
        li: ({ children: itemChildren }) => <li style={{ marginBottom: 2 }}>{itemChildren}</li>,
        pre: ({ children: preChildren }) => (
          <pre style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '8px 10px', overflowX: 'auto', fontSize: 12, margin: '4px 0', fontFamily: 'monospace' }}>
            {preChildren}
          </pre>
        ),
        code: ({ className, children: codeChildren }) =>
          className
            ? <code style={{ fontFamily: 'monospace' }}>{codeChildren}</code>
            : <code style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 3, padding: '1px 4px', fontSize: 12, fontFamily: 'monospace' }}>{codeChildren}</code>,
        strong: ({ children: strongChildren }) => <strong style={{ fontWeight: 800 }}>{strongChildren}</strong>,
        h1: ({ children: headingChildren }) => <div style={{ fontWeight: 800, fontSize: 18, margin: '6px 0 4px' }}>{headingChildren}</div>,
        h2: ({ children: headingChildren }) => <div style={{ fontWeight: 800, fontSize: 17, margin: '6px 0 4px' }}>{headingChildren}</div>,
        h3: ({ children: headingChildren }) => <div style={{ fontWeight: 700, fontSize: 16, margin: '4px 0 2px' }}>{headingChildren}</div>,
        a: ({ href, children: linkChildren }) => {
          const pageMatch = href?.match(/^#page-(\d+)$/)
          if (pageMatch) {
            const page = Number(pageMatch[1])
            return (
              <button
                style={styles.sourceChip}
                onClick={() => onPageJump?.(page)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  const followUp = window.prompt(`p.${page} 근거로 이어서 물어볼 질문을 입력하세요.`)
                  if (!followUp?.trim()) return
                  const answerContext = String(followUpContext ?? '').trim().slice(0, 2400)
                  window.dispatchEvent(new CustomEvent('costudy:chat-follow-up', {
                    detail: {
                      prompt: `아래 AI 답변과 p.${page} 근거를 맥락으로 후속 질문에 답해줘.

[이전 AI 답변]
${answerContext || '(이전 답변 없음)'}

[후속 질문]
${followUp.trim()}`,
                    },
                  }))
                }}
                title={`${page}페이지로 이동 · 우클릭: 후속 질문 추가`}
              >
                {linkChildren}
              </button>
            )
          }
          return <a href={href} target="_blank" rel="noopener noreferrer">{linkChildren}</a>
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  )
}

function MessageBubble({ message, onPageJump }) {
  const isUser = message.role === 'user'

  return (
    <div style={{ ...styles.messageRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.assistantBubble) }}>
        {message.contextText && isUser && (
          <blockquote style={styles.bubbleContext}>{message.contextText}</blockquote>
        )}
        {!isUser && message.evidenceStatus && (
          <EvidenceBadge evidenceStatus={message.evidenceStatus} />
        )}
        <div style={isUser ? styles.userBubbleText : styles.assistantBubbleText}>
          {isUser
            ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
            : <MarkdownContent onPageJump={onPageJump} followUpContext={message.content}>{message.content}</MarkdownContent>}
        </div>
      </div>
    </div>
  )
}

function EvidenceBadge({ evidenceStatus }) {
  const tone = styles.evidenceTones[evidenceStatus.status] ?? styles.evidenceTones.weak
  const pages = evidenceStatus.pages ?? []
  const pageText = pages.length > 0
    ? ` · p.${pages[0]}${pages.length > 1 ? ` 외 ${pages.length - 1}개` : ''}`
    : ''
  const allPagesText = pages.length > 0
    ? ` (${pages.map((page) => `p.${page}`).join(', ')})`
    : ''
  const warningText = evidenceStatus.warnings?.length
    ? ` · 주의 ${evidenceStatus.warnings.length}`
    : ''

  return (
    <div style={{ ...styles.evidenceBadge, ...tone }} title={`${evidenceStatus.description}${allPagesText}`}>
      {evidenceStatus.label}{pageText}{warningText}
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
    background: '#eeeef8',
  },
  contextBanner: {
    background: '#ffffff',
    borderBottom: '1px solid #eeeeee',
    padding: '10px 16px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  contextTop: { display: 'flex', alignItems: 'center' },
  contextLabel: { fontSize: 12, color: '#070761', fontWeight: 800 },
  chipList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    maxHeight: 105,
    overflowY: 'auto',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#eeeef8',
    borderRadius: 5,
    padding: '5px 7px',
  },
  colorDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  chipText: {
    minWidth: 0,
    color: '#484848',
    fontSize: 12,
    lineHeight: '18px',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chipThumb: {
    width: 36,
    height: 24,
    objectFit: 'cover',
    borderRadius: 3,
    border: '1px solid rgba(7,7,97,0.16)',
    flexShrink: 0,
  },
  chipClose: {
    width: 20,
    height: 20,
    padding: 0,
    color: '#6e6e6e',
    fontSize: 16,
    lineHeight: '18px',
    flexShrink: 0,
  },
  quickActions: { display: 'flex', alignItems: 'center', gap: 6 },
  quickBtn: {
    height: 28,
    padding: '0 12px',
    borderRadius: 5,
    background: '#070761',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 800,
  },
  emptyContext: {
    height: 31,
    flexShrink: 0,
  },
  indexNotice: {
    flexShrink: 0,
    padding: '7px 14px',
    background: '#fffaeb',
    borderBottom: '1px solid #fedf89',
    color: '#93370d',
    fontSize: 11,
    lineHeight: '16px',
    fontWeight: 700,
  },
  indexNoticeError: {
    background: '#fff1f3',
    borderBottomColor: '#fecdd6',
    color: '#c01048',
  },
  suggestedQuestions: {
    height: 184,
    padding: '13px 12px 13px 16px',
    background: '#eeeef8',
    borderBottom: '1px solid rgba(7,7,97,0.08)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  suggestedHeader: {
    height: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  suggestedLabel: {
    marginLeft: 5,
    marginRight: 'auto',
    color: '#070761',
    fontSize: 15,
    lineHeight: '20px',
    fontWeight: 800,
  },
  suggestedToggle: {
    width: 20,
    height: 20,
    padding: 0,
    color: '#000000',
    fontSize: 15,
    lineHeight: '20px',
    fontWeight: 700,
  },
  gateHeaderBtn: {
    height: 22,
    padding: '0 7px',
    borderRadius: 5,
    background: '#ffffff',
    color: '#070761',
    fontSize: 10,
    lineHeight: '20px',
    fontWeight: 900,
  },
  suggestedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
    overflow: 'hidden',
  },
  suggestedCard: {
    height: 60,
    borderRadius: 5,
    background: '#ffffff',
    padding: '10px 17px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 9,
  },
  suggestedCardOpen: {
    minHeight: 60,
    borderRadius: 5,
    background: '#ffffff',
    padding: '10px 17px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 9,
  },
  questionTextBtn: {
    minWidth: 0,
    padding: 0,
    color: '#000000',
    fontSize: 15,
    lineHeight: '20px',
    textAlign: 'left',
    fontWeight: 500,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  answerBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    borderTop: '1px solid #eeeef8',
    paddingTop: 8,
  },
  answerInput: {
    resize: 'vertical',
    minHeight: 62,
    border: '1px solid rgba(7,7,97,0.18)',
    borderRadius: 7,
    padding: '7px 9px',
    fontSize: 12,
    fontFamily: 'inherit',
    lineHeight: '18px',
    outline: 'none',
  },
  answerActions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  answerBtn: {
    height: 28,
    borderRadius: 5,
    padding: '0 10px',
    background: '#070761',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 800,
  },
  answerGhostBtn: {
    height: 28,
    borderRadius: 5,
    padding: '0 10px',
    background: '#eeeef8',
    color: '#070761',
    fontSize: 11,
    fontWeight: 800,
  },
  filterRow: {
    flexShrink: 0,
    display: 'flex',
    gap: 5,
    padding: '7px 12px',
    background: '#ffffff',
    borderBottom: '1px solid #eeeeee',
    overflowX: 'auto',
  },
  filterBtn: {
    border: '1px solid #e5e5ee',
    background: '#ffffff',
    color: '#6e6e6e',
    borderRadius: 5,
    padding: '4px 9px',
    fontSize: 11,
    lineHeight: '16px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  filterBtnActive: {
    borderColor: '#070761',
    background: '#eeeef8',
    color: '#070761',
  },
  messageList: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '12px 14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  centerHint: {
    flex: 1,
    minHeight: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: { color: '#6e6e6e', fontSize: 13, lineHeight: '20px', textAlign: 'center' },
  messageRow: {
    width: '100%',
    display: 'flex',
    flex: '0 0 auto',
    alignItems: 'flex-start',
    clear: 'both',
  },
  bubble: {
    width: 'fit-content',
    maxWidth: '92%',
    minHeight: 0,
    padding: '10px 12px',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(7,7,97,0.10)',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    position: 'static',
    display: 'block',
    flex: '0 1 auto',
  },
  userBubble: {
    background: '#070761',
    color: '#ffffff',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    background: '#ffffff',
    color: '#000000',
    border: '1px solid rgba(7,7,97,0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleContext: {
    margin: '0 0 8px',
    paddingLeft: 10,
    borderLeft: '2px solid rgba(255,255,255,0.55)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 400,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  userBubbleText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: '20px',
    fontWeight: 500,
  },
  assistantBubbleText: {
    color: '#000000',
    fontSize: 13,
    lineHeight: '20px',
    fontWeight: 500,
  },
  evidenceBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: 6,
    padding: '3px 7px',
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 800,
    lineHeight: '14px',
    whiteSpace: 'normal',
    wordBreak: 'keep-all',
  },
  evidenceTones: {
    grounded: { background: '#ecfdf3', color: '#067647', border: '1px solid #abefc6' },
    partial: { background: '#eff6ff', color: '#175cd3', border: '1px solid #b2ddff' },
    weak: { background: '#fffaeb', color: '#b54708', border: '1px solid #fedf89' },
    none: { background: '#fff1f3', color: '#c01048', border: '1px solid #fecdd6' },
  },
  cursor: { color: '#070761' },
  error: { fontSize: 12, color: '#c01048', padding: '4px 0', alignSelf: 'flex-start' },
  sourceChip: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    background: '#eeeef8',
    color: '#070761',
    border: '1px solid rgba(7,7,97,0.2)',
    lineHeight: '16px',
    verticalAlign: 'middle',
    margin: '0 2px',
  },
  inputArea: {
    minHeight: 65,
    padding: '10px 8px 10px 10px',
    background: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 0,
    alignItems: 'stretch',
    flexShrink: 0,
  },
  inputAreaWithContext: {
    minHeight: 122,
    padding: '15px 8px 10px 10px',
    justifyContent: 'flex-start',
  },
  composerContext: {
    minHeight: 40,
    display: 'grid',
    gridTemplateColumns: '5px minmax(0, 1fr) 28px',
    alignItems: 'start',
    gap: 13,
    padding: '0 8px 10px 12px',
  },
  composerAccent: {
    width: 5,
    height: 28,
    marginTop: 3,
    background: 'rgba(7,7,97,0.5)',
  },
  composerContextText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    color: '#000000',
    fontSize: 11,
    lineHeight: 1.5,
  },
  composerContextTitle: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
  },
  composerContextBody: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
  },
  composerContextClose: {
    width: 28,
    height: 28,
    padding: 0,
    color: '#6e6e6e',
    fontSize: 28,
    lineHeight: '24px',
    fontWeight: 300,
  },
  composerDivider: {
    height: 1,
    margin: '0 8px 0 10px',
    background: '#d7d7dc',
  },
  composerRow: {
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    resize: 'none',
    border: 'none',
    borderRadius: 0,
    padding: '11px 10px',
    color: '#111111',
    fontSize: 14,
    fontFamily: 'inherit',
    lineHeight: '20px',
    outline: 'none',
    overflow: 'hidden',
    background: 'transparent',
  },
  sendBtn: {
    width: 59,
    height: 44,
    borderRadius: 10,
    background: '#070761',
    color: '#ffffff',
    fontSize: 14,
    lineHeight: '25px',
    fontWeight: 800,
    flexShrink: 0,
  },
}
