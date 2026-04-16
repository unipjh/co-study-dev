import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import useAI from '../AI/useAI'
import useChat from '../../hooks/useChat'
import useDocumentIndex from '../../hooks/useDocumentIndex'
import { getDisplayColor } from '../../lib/colorUtils'
import useDocumentStore from '../../store/documentStore'

/**
 * Chat 탭 패널
 * - contextAnnotations 배열의 텍스트를 맥락으로 대화 시작
 * - 맥락은 개별 × 버튼으로 제거 가능
 * - 설명 / 퀴즈 생성 빠른 액션 버튼 제공
 * - 대화 내용 Firestore 영구 저장
 *
 * @param {{ docId, contextAnnotations, onClearContext }} props
 */
export default function ChatPanel({ docId, contextAnnotations = [], onClearContext }) {
  const { messages, addMessage } = useChat(docId)
  const { chat } = useAI()
  const { indexed, indexing, indexProgress, indexTotal, indexError, buildIndex, search } = useDocumentIndex(docId)

  const [input, setInput]             = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming]  = useState(false)
  const [error, setError]             = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim()
    if (!text || !docId || isStreaming) return

    setInput('')
    setError(null)
    setIsStreaming(true)
    setStreamingText('')

    try {
      // ── RAG: 관련 페이지 검색 → 프롬프트 앞에 주입 ──────────────
      const topChunks = await search(text)

      const availablePages = topChunks.map((c) => `p.${c.pageIndex + 1}`).join(', ')
      const ragBlock = topChunks.length > 0
        ? `[문서 참고 자료 — 검색된 관련 페이지]\n` +
          topChunks.map((c) => `(p.${c.pageIndex + 1}) ${c.text}`).join('\n') +
          '\n\n[답변 지침]\n' +
          `- 위 참고 자료(${availablePages})에 있는 내용을 근거로 답변하세요.\n` +
          `- [p.숫자] 인용은 위 목록(${availablePages})에 실제로 존재하는 페이지만 사용하세요. 없는 페이지 번호는 절대 만들지 마세요.\n` +
          '- 참고 자료에서 찾을 수 없는 내용은 "교안에서 확인할 수 없는 내용입니다"라고 명시하세요.\n' +
          '- 각 문단 끝에 참고한 페이지를 [p.숫자] 형식으로 표시하세요.\n---\n'
        : ''

      // ── 하이라이트 맥락 ──────────────────────────────────────────
      const hasContext = contextAnnotations.length > 0
      const contextText = hasContext
        ? contextAnnotations.map((a, i) => {
            const isRegion = a.type === 'region'
            const label = isRegion ? '[영역 선택 (이미지 첨부)]' : `"${a.text}"`
            const memo  = a.content ? `\n   [메모] ${a.content}` : ''
            return `${i + 1}. ${label}${memo}`
          }).join('\n')
        : null
      const fullPrompt = contextText
        ? `${ragBlock}[선택 맥락:\n${contextText}]\n\n${text}`
        : `${ragBlock}${text}`

      // 이미지 파트 수집 (영역 선택으로 보낸 이미지)
      const imageParts = contextAnnotations
        .filter((a) => a.imageData)
        .map((a) => ({ inlineData: { data: a.imageData, mimeType: 'image/png' } }))

      await addMessage('user', text, contextText)

      const history = messages.map((m) => ({ role: m.role, content: m.content }))

      await chat(
        history,
        fullPrompt,
        (_, full) => setStreamingText(full),
        async (full) => {
          setStreamingText('')
          setIsStreaming(false)
          await addMessage('assistant', full, contextText)
        },
        (errMsg) => {
          setError(errMsg)
          setIsStreaming(false)
          setStreamingText('')
        },
        imageParts,
      )
    } catch (err) {
      setError(err.message ?? '오류가 발생했습니다')
      setIsStreaming(false)
      setStreamingText('')
    }
  }

  async function handleQuickAction(key) {
    if (contextAnnotations.length === 0) return
    const prompts = {
      explain: '이 내용을 쉽게 설명해줘',
      quiz:    '이 내용으로 퀴즈를 만들어줘',
    }
    await handleSend(prompts[key])
  }

  function handlePageJump(page) {
    useDocumentStore.getState().setCurrentPage(page)
    useDocumentStore.getState().setViewMode('page')
  }

  const noDoc = !docId
  const hasContext = contextAnnotations.length > 0

  return (
    <div style={styles.panel}>
      {/* 색인 생성 진행 배너 */}
      {indexing && (
        <div style={styles.indexBanner}>
          <div style={styles.indexBarTrack}>
            <div
              style={{
                ...styles.indexBarFill,
                width: indexTotal > 0 ? `${(indexProgress / indexTotal) * 100}%` : '0%',
              }}
            />
          </div>
          <span style={styles.indexLabel}>
            문서 색인 생성 중… {indexProgress}/{indexTotal}p
          </span>
        </div>
      )}
      {/* 색인 실패 배너 */}
      {indexError && !indexing && (
        <div style={styles.indexErrorBanner}>
          <span style={styles.indexErrorLabel}>색인 실패: {indexError}</span>
          <button style={styles.indexRetryBtn} onClick={buildIndex}>재시도</button>
        </div>
      )}

      {/* 맥락 배너 */}
      {hasContext ? (
        <div style={styles.contextBanner}>
          <div style={styles.contextTop}>
            <span style={styles.contextLabel}>선택 맥락 {contextAnnotations.length}개</span>
          </div>
          {/* 맥락 칩 목록 */}
          <div style={styles.chipList}>
            {contextAnnotations.map((ann) => (
              <div key={ann.id} style={styles.chip}>
                <span style={{ ...styles.colorDot, background: getDisplayColor(ann.color) }} />
                {ann.imageData && (
                  <img
                    src={`data:image/png;base64,${ann.imageData}`}
                    style={styles.chipThumb}
                    alt="영역 이미지"
                  />
                )}
                <span style={styles.chipText}>
                  {ann.type === 'region'
                    ? ann.imageData ? '[이미지 영역]' : ann.content ? `[영역] ${ann.content}` : '[영역 선택 — 메모 없음]'
                    : `"${ann.text}"${ann.content ? ` / ${ann.content}` : ''}`}
                </span>
                <button
                  style={styles.chipClose}
                  onClick={() => onClearContext?.(ann.id)}
                  title="맥락 제거"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {/* 빠른 액션 */}
          <div style={styles.quickActions}>
            <button
              style={styles.quickBtn}
              onClick={() => handleQuickAction('explain')}
              disabled={isStreaming}
            >
              설명
            </button>
            <button
              style={styles.quickBtn}
              onClick={() => handleQuickAction('quiz')}
              disabled={isStreaming}
            >
              퀴즈 생성
            </button>
            <span style={styles.quickHint}>또는 아래 입력창에서 직접 질문</span>
          </div>
        </div>
      ) : (
        <div style={styles.emptyContext}>
          <p style={styles.emptyContextHint}>
            아래 입력창에서 바로 질문하거나,<br />하이라이트 → '맥락 추가'로 맥락 기반 대화를 시작하세요
          </p>
        </div>
      )}

      {/* 메시지 목록 */}
      <div style={styles.messageList}>
        {noDoc && (
          <div style={styles.centerHint}>
            <p style={styles.hintText}>PDF를 열면 채팅을 시작할 수 있습니다</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onPageJump={handlePageJump} />
        ))}
        {isStreaming && streamingText && (
          <div style={{ ...styles.bubble, ...styles.assistantBubble }}>
            <div style={styles.bubbleText}>
              <MarkdownContent onPageJump={handlePageJump}>{streamingText}</MarkdownContent>
              <span style={styles.cursor}>▌</span>
            </div>
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div style={styles.inputArea}>
        <textarea
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={noDoc ? 'PDF를 먼저 열어주세요' : hasContext ? '맥락 기반으로 질문하거나 자유롭게 대화하세요… (Enter: 전송)' : '질문을 입력하세요… (Enter: 전송, Shift+Enter: 줄바꿈)'}
          disabled={noDoc || isStreaming}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: (noDoc || isStreaming || !input.trim()) ? 0.4 : 1,
          }}
          onClick={() => handleSend()}
          disabled={noDoc || isStreaming || !input.trim()}
        >
          전송
        </button>
      </div>
    </div>
  )
}

/**
 * [p.N] 또는 [p.N, p.M] 패턴을 ReactMarkdown이 처리할 수 있는
 * 링크 문법 [p.N](page://N)으로 변환
 */
function processSourceMarkers(text) {
  return text.replace(/\[(?:p\.\s*\d+[\s,，、]*)+\]/g, (match) => {
    const pages = [...match.matchAll(/\d+/g)].map((m) => m[0])
    return pages.map((p) => `[p.${p}](page://${p})`).join(' ')
  })
}

function MarkdownContent({ children, onPageJump }) {
  const processed = processSourceMarkers(children ?? '')
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // <p> → <div>: pre/table 등 블록 요소 중첩 시 HTML 규격 위반 방지
        p:      ({ children }) => <div style={{ margin: '0 0 6px', lineHeight: 1.6 }}>{children}</div>,
        ul:     ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
        ol:     ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
        li:     ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
        // pre: 코드 블록 래퍼
        pre:    ({ children }) => (
          <pre style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '8px 10px', overflowX: 'auto', fontSize: 12, margin: '4px 0', fontFamily: 'monospace' }}>
            {children}
          </pre>
        ),
        // code: className 있으면 블록(pre 내부) → 스타일 리셋, 없으면 인라인
        code:   ({ className, children }) =>
          className
            ? <code style={{ fontFamily: 'monospace' }}>{children}</code>
            : <code style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 3, padding: '1px 4px', fontSize: 12, fontFamily: 'monospace' }}>{children}</code>,
        strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
        h1:     ({ children }) => <div style={{ fontWeight: 700, fontSize: 15, margin: '6px 0 4px' }}>{children}</div>,
        h2:     ({ children }) => <div style={{ fontWeight: 700, fontSize: 14, margin: '6px 0 4px' }}>{children}</div>,
        h3:     ({ children }) => <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 2px' }}>{children}</div>,
        // page:// 링크 → 페이지 이동 칩 버튼으로 렌더링
        a: ({ href, children: linkChildren }) => {
          if (href?.startsWith('page://')) {
            const page = Number(href.slice(7))
            return (
              <button
                style={styles.sourceChip}
                onClick={() => onPageJump?.(page)}
                title={`${page}페이지로 이동`}
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
    <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.assistantBubble) }}>
      {message.contextText && isUser && (
        <p style={styles.bubbleContext}>"{message.contextText}"</p>
      )}
      <div style={styles.bubbleText}>
        {isUser
          ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
          : <MarkdownContent onPageJump={onPageJump}>{message.content}</MarkdownContent>
        }
      </div>
    </div>
  )
}

const styles = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#fafafa',
  },
  // 색인 진행 배너
  indexBanner: {
    padding: '8px 14px 6px',
    background: '#f0f4ff',
    borderBottom: '1px solid #dde5ff',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  indexBarTrack: {
    height: 3,
    background: '#dde5ff',
    borderRadius: 2,
    overflow: 'hidden',
  },
  indexBarFill: {
    height: '100%',
    background: '#6366f1',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  indexLabel: {
    fontSize: 10,
    color: '#6366f1',
    fontWeight: 500,
  },
  indexErrorBanner: {
    padding: '7px 14px',
    background: '#fff0f0',
    borderBottom: '1px solid #ffd5d5',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  indexErrorLabel: {
    fontSize: 11,
    color: '#c00',
    flex: 1,
  },
  indexRetryBtn: {
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 5,
    background: '#c00',
    color: '#fff',
    cursor: 'pointer',
    flexShrink: 0,
    fontWeight: 600,
  },
  // 맥락 배너
  contextBanner: {
    background: '#f0f0ff',
    borderBottom: '1px solid #e0e0ff',
    padding: '10px 14px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  contextTop: { display: 'flex', alignItems: 'center' },
  contextLabel: { fontSize: 10, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase' },
  // 맥락 칩 목록
  chipList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 100,
    overflowY: 'auto',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: '#fff',
    border: '1px solid #e0e0ff',
    borderRadius: 6,
    padding: '4px 6px',
  },
  colorDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  chipText: {
    fontSize: 11,
    color: '#444',
    lineHeight: 1.4,
    flex: 1,
    fontStyle: 'italic',
    display: '-webkit-box',
    WebkitLineClamp: 1,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  chipThumb: {
    width: 36, height: 24, objectFit: 'cover', borderRadius: 3,
    border: '1px solid #e0e0ff', flexShrink: 0,
  },
  chipClose: { fontSize: 14, color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 },
  quickActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  quickHint: { fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginLeft: 2 },
  quickBtn: {
    padding: '4px 12px', borderRadius: 5,
    background: '#6366f1', color: '#fff',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  // 맥락 없을 때 힌트
  emptyContext: {
    padding: '8px 14px',
    background: '#f9f9f9',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  emptyContextHint: { fontSize: 11, color: '#bbb', lineHeight: 1.6, textAlign: 'center' },
  // 메시지 목록
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  centerHint: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80,
  },
  hintText: { fontSize: 13, color: '#bbb', textAlign: 'center' },
  bubble: {
    maxWidth: '86%',
    padding: '8px 12px',
    borderRadius: 10,
    wordBreak: 'break-word',
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: '#1a1a1a',
    color: '#fff',
    borderBottomRightRadius: 3,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    background: '#fff',
    border: '1px solid #e8e8e8',
    color: '#1a1a1a',
    borderBottomLeftRadius: 3,
  },
  bubbleContext: {
    fontSize: 10, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic',
    marginBottom: 4, borderLeft: '2px solid rgba(255,255,255,0.25)', paddingLeft: 6,
  },
  bubbleText: { fontSize: 13, lineHeight: 1.6 },
  cursor: { color: '#6366f1' },
  error: { fontSize: 12, color: '#c00', padding: '4px 0', alignSelf: 'flex-start' },
  // 인라인 출처 칩 (문단 끝에 삽입)
  sourceChip: {
    display: 'inline-block',
    padding: '1px 7px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background: '#ededff',
    color: '#6366f1',
    border: '1px solid #d4d4ff',
    cursor: 'pointer',
    lineHeight: 1.6,
    verticalAlign: 'middle',
    marginLeft: 4,
  },
  // 입력창
  inputArea: {
    padding: '10px 12px',
    background: '#fff',
    borderTop: '1px solid #e8e8e8',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    resize: 'none',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    lineHeight: 1.5,
  },
  sendBtn: {
    padding: '7px 14px',
    background: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
}
