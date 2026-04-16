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

function getGenAI() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('.env에 VITE_GEMINI_API_KEY를 설정해주세요.')
  return new GoogleGenerativeAI(apiKey)
}

const EMBED_MODEL = 'models/gemini-embedding-2-preview'

function getEmbedApiKey() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('.env에 VITE_GEMINI_API_KEY를 설정해주세요.')
  return apiKey
}

/**
 * 단일 텍스트 임베딩 (쿼리 검색용)
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const apiKey = getEmbedApiKey()
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  })
  if (!res.ok) throw new Error(`embedText 오류: ${await res.text()}`)
  const data = await res.json()
  return data.embedding.values
}

/**
 * 배치 임베딩 — 여러 텍스트를 한 번의 API 호출로 처리
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function batchEmbedTexts(texts) {
  const apiKey = getEmbedApiKey()
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: EMBED_MODEL,
        content: { parts: [{ text }] },
      })),
    }),
  })
  if (!res.ok) throw new Error(`batchEmbedTexts 오류: ${await res.text()}`)
  const data = await res.json()
  return data.embeddings.map((e) => e.values)
}

// 빠른 단발 요청 (explain / quiz) — 저비용 경량 모델
function getFlashLiteModel() {
  return getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: SYSTEM_PROMPT,
  })
}

// Chat / 마인드맵 — 균형 모델
function getFlashModel() {
  return getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  })
}

export default function useAI() {
  const [response, setResponse]     = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError]           = useState(null)
  const abortRef = useRef(null)

  // 단발 요청 (설명 / 퀴즈 생성) — Flash-Lite
  // ragBlock: 선택사항 — RAG 검색 결과를 프롬프트 앞에 주입
  const ask = useCallback(async (selectedText, functionKey, ragBlock = '') => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setResponse('')
    setError(null)
    setIsStreaming(true)

    const prompt = ragBlock + (QUICK_PROMPTS[functionKey] ?? QUICK_PROMPTS.explain)(selectedText)

    try {
      const model = getFlashLiteModel()
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
   * @param {Array<{inlineData:{data:string,mimeType:string}}>} imageParts — 인라인 이미지 (선택)
   */
  const chat = useCallback(async (history, userMessage, onChunk, onDone, onError, imageParts = []) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const model = getFlashModel()
      // Gemini role: 'user' | 'model'
      const geminiHistory = history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
      const session = model.startChat({ history: geminiHistory })
      // 이미지가 있으면 멀티파트 메시지로 전송
      const messageContent = imageParts.length > 0
        ? [...imageParts, { text: userMessage }]
        : userMessage
      const result = await session.sendMessageStream(messageContent, { signal: controller.signal })

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

  /**
   * 마인드맵 3-pass 생성 (비스트리밍)
   * @param {string} text           — 추출된 문서 텍스트
   * @param {(p:{pass:number,label:string}) => void} onProgress
   * @returns {Promise<{nodes, edges}>}
   */
  const generateMindMap = useCallback(async (text, onProgress) => {
    const model = getFlashModel()
    const session = model.startChat({
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    })

    // Pass 1 — 핵심 개념 추출
    onProgress?.({ pass: 1, label: '핵심 개념 추출 중…' })
    const r1 = await session.sendMessage(
      `다음 학습 자료에서 핵심 개념을 5~10개 추출하세요.
반드시 아래 JSON 배열 형식으로만 출력하세요 (다른 텍스트 없이):
[{"id":"node_1","label":"개념(2~5자)","detail":"1~2문장 설명","group":"core|process|structure|effect","importance":1|2|3}]

group 기준: core=중심주제, process=과정·절차, structure=구조·구성요소, effect=결과·효과
importance: 3=가장 중요, 1=보조 개념

학습 자료:
${text}`
    )
    const nodesRaw = JSON.parse(r1.response.text())
    const nodes = Array.isArray(nodesRaw) ? nodesRaw : (nodesRaw.nodes ?? [])

    // Pass 2 — 관계 분류
    onProgress?.({ pass: 2, label: '개념 간 관계 분류 중…' })
    const r2 = await session.sendMessage(
      `위 개념들 사이의 의미 있는 관계를 추출하세요.
실제 텍스트에 근거가 있는 관계만 포함하세요.

JSON 배열 형식으로만 출력하세요:
[{"id":"edge_1_2","from":"node_id","to":"node_id","label":"한국어 관계 설명","type":"causes|exemplifies|contrasts|contains|related"}]`
    )
    const edgesRaw = JSON.parse(r2.response.text())
    const edges = Array.isArray(edgesRaw) ? edgesRaw : (edgesRaw.edges ?? [])

    // Pass 3 — 원문 그라운딩
    onProgress?.({ pass: 3, label: '원문 인용 연결 중…' })
    const r3 = await session.sendMessage(
      `각 개념 노드에 원문 인용구와 페이지 번호를 연결하세요.
반드시 텍스트에서 실제로 등장하는 문장을 발췌하세요.

JSON 배열 형식으로만 출력하세요:
[{"id":"node_id","sources":[{"pageIndex":0,"quote":"원문 인용구 (1문장 이내)"}]}]`
    )
    const sourcesRaw = JSON.parse(r3.response.text())
    const sourcesList = Array.isArray(sourcesRaw) ? sourcesRaw : (sourcesRaw.nodes ?? [])

    // sources를 nodes에 병합
    const enrichedNodes = nodes.map((n) => {
      const found = sourcesList.find((s) => s.id === n.id)
      return found ? { ...n, sources: found.sources ?? [] } : { ...n, sources: [] }
    })

    return { nodes: enrichedNodes, edges }
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

  return { response, isStreaming, error, ask, abort, reset, chat, generateMindMap }
}
