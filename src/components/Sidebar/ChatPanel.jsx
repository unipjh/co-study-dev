import { useState, useRef, useEffect } from 'react'
import useAI from '../AI/useAI'
import useChat from '../../hooks/useChat'
import { getDisplayColor } from '../../lib/colorUtils'

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

    // 여러 맥락 텍스트를 번호 매겨 합산
    const hasContext = contextAnnotations.length > 0
    const contextText = hasContext
      ? contextAnnotations.map((a, i) => {
          const isRegion = a.type === 'region'
          const label = isRegion ? '[영역 선택]' : `"${a.text}"`
          const memo  = a.content ? `\n   [메모] ${a.content}` : ''
          return `${i + 1}. ${label}${memo}`
        }).join('\n')
      : null
    const fullPrompt = contextText
      ? `[참고 맥락:\n${contextText}]\n\n${text}`
      : text

    await addMessage('user', text, contextText)

    setIsStreaming(true)
    setStreamingText('')

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
    )
  }

  async function handleQuickAction(key) {
    if (contextAnnotations.length === 0) return
    const prompts = {
      explain: '이 내용을 쉽게 설명해줘',
      quiz:    '이 내용으로 퀴즈를 만들어줘',
    }
    await handleSend(prompts[key])
  }

  const noDoc = !docId
  const hasContext = contextAnnotations.length > 0

  return (
    <div style={styles.panel}>
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
                <span style={styles.chipText}>
                  {ann.type === 'region'
                    ? ann.content ? `[영역] ${ann.content}` : '[영역 선택 — 메모 없음]'
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
          </div>
        </div>
      ) : (
        <div style={styles.emptyContext}>
          <p style={styles.emptyContextHint}>
            하이라이트 클릭 → '맥락 추가'로<br />맥락 기반 대화를 시작할 수 있습니다
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
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && streamingText && (
          <div style={{ ...styles.bubble, ...styles.assistantBubble }}>
            <p style={styles.bubbleText}>
              {streamingText}
              <span style={styles.cursor}>▌</span>
            </p>
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
          placeholder={noDoc ? 'PDF를 먼저 열어주세요' : '질문을 입력하세요… (Shift+Enter: 줄바꿈)'}
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

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.assistantBubble) }}>
      {message.contextText && isUser && (
        <p style={styles.bubbleContext}>"{message.contextText}"</p>
      )}
      <p style={styles.bubbleText}>{message.content}</p>
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
  chipClose: { fontSize: 14, color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 },
  quickActions: { display: 'flex', gap: 6 },
  quickBtn: {
    padding: '4px 12px', borderRadius: 5,
    background: '#6366f1', color: '#fff',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  // 맥락 없을 때 힌트
  emptyContext: {
    padding: '10px 14px',
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
  bubbleText: { fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  cursor: { color: '#6366f1' },
  error: { fontSize: 12, color: '#c00', padding: '4px 0', alignSelf: 'flex-start' },
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
