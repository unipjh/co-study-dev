import { useState, useRef, useCallback } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPT = `당신은 학습 보조 AI 튜터입니다.
학생이 자료를 이해하고 학습하는 것을 돕습니다.
- 응답은 간결하고 명확하게, 학습에 직접 도움이 되도록 작성합니다.
- 친근하고 이해하기 쉬운 언어를 사용합니다.
- 마크다운 형식을 적절히 활용합니다.`

// 빠른 단발성 요청 프롬프트
const QUICK_PROMPTS = {
  explain: (text) => `아래 내용을 쉽게 설명해줘.
형식: ① 개념 정의 (1~2문장) → ② 쉬운 비유나 예시 (1~2문장)
추가 질문 없이 바로 결과만 출력해.

---
${text}`,

  quiz: (text) => `아래 내용으로 학습 퀴즈를 만들어줘.
형식:
Q. (질문)
A. (정답)
해설: (한 줄 설명)
추가 질문 없이 바로 결과만 출력해.

---
${text}`,
}

function getModel() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('.env에 VITE_GEMINI_API_KEY를 설정해주세요.')
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  })
}

export default function useAI() {
  const [response, setResponse]     = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError]           = useState(null)
  const abortRef = useRef(null)

  // 단발 요청 (설명 / 퀴즈 생성)
  const ask = useCallback(async (selectedText, functionKey) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setResponse('')
    setError(null)
    setIsStreaming(true)

    const prompt = (QUICK_PROMPTS[functionKey] ?? QUICK_PROMPTS.explain)(selectedText)

    try {
      const model = getModel()
      const result = await model.generateContentStream(prompt, { signal: controller.signal })
      for await (const chunk of result.stream) {
        if (controller.signal.aborted) break
        setResponse((prev) => prev + chunk.text())
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message ?? 'AI 호출 실패')
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [])

  /**
   * 멀티턴 채팅
   * @param {Array<{role, content}>} history  — 이전 메시지 배열
   * @param {string} userMessage              — 새 사용자 입력
   * @param {(chunk: string, full: string) => void} onChunk
   * @param {(full: string) => void} onDone
   * @param {(errMsg: string) => void} onError
   */
  const chat = useCallback(async (history, userMessage, onChunk, onDone, onError) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const model = getModel()
      // Gemini role: 'user' | 'model'
      const geminiHistory = history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
      const session = model.startChat({ history: geminiHistory })
      const result = await session.sendMessageStream(userMessage, { signal: controller.signal })

      let full = ''
      for await (const chunk of result.stream) {
        if (controller.signal.aborted) break
        const text = chunk.text()
        full += text
        onChunk?.(text, full)
      }
      onDone?.(full)
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message ?? 'AI 호출 실패')
    } finally {
      abortRef.current = null
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    abort()
    setResponse('')
    setError(null)
  }, [abort])

  return { response, isStreaming, error, ask, abort, reset, chat }
}
