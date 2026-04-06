import { useState, useRef, useEffect } from 'react'
import useAI from '../AI/useAI'
import useChat from '../../hooks/useChat'

const COLOR_BG = { yellow: '#FFD700', blue: '#6BB5FF', green: '#5CCC7F' }

/**
 * Chat 탭 패널
 * - contextAnnotation이 있으면 해당 텍스트를 맥락으로 대화 시작
 * - 설명 / 퀴즈 생성 빠른 액션 버튼 제공
 * - 대화 내용 Firestore 영구 저장
 *
 * @param {{ docId, contextAnnotation, onClearContext }} props
 */
export default function ChatPanel({ docId, contextAnnotation, onClearContext }) {
  const { messages, addMessage } = useChat(docId)
  const { chat } = useAI()

  const [input, setInput]             = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming]  = useState(false)
  const [error, setError]             = useState(null)
  const bottomRef = useRef(null)

  // 새 메시지가 추가되면 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim()
    if (!text || !docId || isStreaming) return

    setInput('')
    setError(null)

    // 컨텍스트 annotation이 있으면 사용자 메시지에 포함
    const contextText = contextAnnotation?.text ?? null
    const fullPrompt = contextText
      ? `[참고 텍스트: "${contextText}"]\n\n${text}`
      : text

    await addMessage('user', text, contextText)

    setIsStreaming(true)
    setStreamingText('')

    // Firestore에 저장된 이전 메시지를 히스토리로 사용
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
    if (!contextAnnotation) return
    const prompts = {
      explain: '이 내용을 쉽게 설명해줘',
      quiz:    '이 내용으로 퀴즈를 만들어줘',
    }
    await handleSend(prompts[key])
  }

  const noDoc = !docId

  return (
    <div style={styles.panel}>
      {/* 컨텍스트 배너 */}
      {contextAnnotation ? (
        <div style={styles.contextBanner}>
          <div style={styles.contextTop}>
            <span style={{ ...styles.colorDot, background: COLOR_BG[contextAnnotation.color] }} />
            <span style={styles.contextLabel}>선택 컨텍스트</span>
            <button style={styles.clearBtn} onClick={onClearContext}>×</button>
          </div>
          <p style={styles.contextText}>"{contextAnnotation.text}"</p>
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
            하이라이트를 클릭 → 'Chat으로 보내기'로<br />맥락 기반 대화를 시작할 수 있습니다
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
  // 컨텍스트 배너
  contextBanner: {
    background: '#f0f0ff',
    borderBottom: '1px solid #e0e0ff',
    padding: '10px 14px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  contextTop: { display: 'flex', alignItems: 'center', gap: 6 },
  colorDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  contextLabel: { fontSize: 10, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', flex: 1 },
  clearBtn: { fontSize: 15, color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: '0 2px' },
  contextText: {
    fontSize: 12, color: '#444', lineHeight: 1.5, fontStyle: 'italic',
    borderLeft: '2px solid #6366f1', paddingLeft: 8,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  quickActions: { display: 'flex', gap: 6 },
  quickBtn: {
    padding: '4px 12px', borderRadius: 5,
    background: '#6366f1', color: '#fff',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  // 컨텍스트 없을 때 힌트
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
