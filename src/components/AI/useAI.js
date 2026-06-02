import { useState, useRef, useCallback } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  SYSTEM_PROMPT,
  QUICK_PROMPTS,
  buildRagSystemInstruction,
  NO_CHUNK_FALLBACK,
} from '../../lib/ai/promptContracts'
import { validateMindMapGraph } from '../../lib/mindmapValidation'
import { formatQuizAvoidanceBlock } from '../../lib/quizDiversity'

export { buildRagSystemInstruction, NO_CHUNK_FALLBACK }

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

function extractJsonObject(text) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('학습 목표 JSON을 찾지 못했습니다.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizePageGoal(raw) {
  const priority = ['low', 'medium', 'high'].includes(raw?.priority) ? raw.priority : 'medium'
  const objectives = Array.isArray(raw?.objectives) ? raw.objectives.filter(Boolean).slice(0, 3) : []
  const focusQuestions = Array.isArray(raw?.focusQuestions) ? raw.focusQuestions.filter(Boolean).slice(0, 2) : []
  const keywords = Array.isArray(raw?.keywords) ? raw.keywords.filter(Boolean).slice(0, 6) : []
  const mainObjective = String(raw?.mainObjective || objectives[0] || '').trim()

  if (!mainObjective) throw new Error('학습 목표가 비어 있습니다.')

  return {
    mainObjective,
    objectives,
    focusQuestions,
    keywords,
    priority,
  }
}

function normalizeOxQuestions(raw) {
  const source = Array.isArray(raw?.oxQuestions)
    ? raw.oxQuestions
    : Array.isArray(raw?.checkQuestions)
      ? raw.checkQuestions
      : []

  return source
    .map((item, index) => {
      const answerRaw = String(item?.answer ?? item?.correctAnswer ?? '').trim().toUpperCase()
      const answer = answerRaw === 'X' ? 'X' : 'O'
      return {
        id: item?.id || `ox_${index + 1}`,
        statement: String(item?.statement || item?.question || '').trim(),
        answer,
        explanation: String(item?.explanation || '').trim(),
      }
    })
    .filter((item) => item.statement)
    .slice(0, 2)
}

function normalizePageOxQuestions(raw) {
  const source = raw?.pageOxQuestions && typeof raw.pageOxQuestions === 'object'
    ? raw.pageOxQuestions
    : {}

  return Object.fromEntries(
    Object.entries(source)
      .map(([pageIndex, value]) => {
        const questions = normalizeOxQuestions({ oxQuestions: Array.isArray(value) ? value : [] })
        return [String(pageIndex), questions]
      })
      .filter(([, questions]) => questions.length > 0)
  )
}

function normalizeLearningUnitGoal(raw) {
  const base = normalizePageGoal(raw)
  const oxQuestions = normalizeOxQuestions(raw)
  const pageOxQuestions = normalizePageOxQuestions(raw)
  const pageHints = raw?.pageHints && typeof raw.pageHints === 'object'
    ? Object.fromEntries(
        Object.entries(raw.pageHints)
          .filter(([, value]) => typeof value === 'string' && value.trim())
          .map(([key, value]) => [String(key), value.trim().slice(0, 90)])
      )
    : {}
  return { ...base, oxQuestions, pageOxQuestions, pageHints }
}

function extractJsonArray(text) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('퀴즈 JSON을 찾지 못했습니다.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeQuizItems(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((item, index) => {
      const type = ['multiple_choice', 'ox', 'short_answer'].includes(item?.type)
        ? item.type
        : 'short_answer'
      const choices = Array.isArray(item?.choices)
        ? item.choices.map((choice) => String(choice).trim()).filter(Boolean).slice(0, 4)
        : []
      return {
        id: item?.id || `quiz_${Date.now()}_${index}`,
        type,
        question: String(item?.question || '').trim(),
        choices: type === 'multiple_choice' ? choices : [],
        answer: String(item?.answer || '').trim(),
        explanation: String(item?.explanation || '').trim(),
      }
    })
    .filter((item) => item.question && item.answer)
    .slice(0, 6)
}

export async function generatePageGoal(pageText, pageIndex, neighborText = '') {
  const text = String(pageText ?? '').trim()
  if (text.length < 80) {
    throw new Error('이 페이지는 목표를 만들 텍스트가 부족합니다.')
  }

  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.35 },
    systemInstruction: `당신은 학습자가 PDF를 능동적으로 읽도록 돕는 한국어 학습 코치입니다.
요약문을 쓰지 말고, 사용자가 이 페이지를 읽을 때 확인해야 할 사고 방향과 우선순위를 제시하세요.`,
  })

  const prompt = `다음 PDF ${pageIndex + 1}페이지를 읽기 전에 볼 핵심 학습 목표를 만드세요.

규칙:
- 한국어로만 작성하세요.
- 내용을 대신 요약하지 말고, 읽을 때 확인해야 할 방향을 제시하세요.
- 목표는 행동 동사로 시작하세요. 예: 구분하기, 설명하기, 연결하기, 표시하기, 비교하기.
- mainObjective는 한 문장, 70자 이내로 작성하세요.
- objectives는 최대 3개, focusQuestions는 최대 2개, keywords는 최대 6개입니다.
- priority는 low, medium, high 중 하나입니다.
- JSON 객체만 출력하세요.

형식:
{
  "mainObjective": "...",
  "objectives": ["...", "..."],
  "focusQuestions": ["..."],
  "keywords": ["..."],
  "priority": "low|medium|high"
}

앞뒤 맥락:
${neighborText.slice(0, 1200) || '(없음)'}

현재 페이지 텍스트:
${text.slice(0, 3200)}`

  const result = await model.generateContent(prompt)
  return normalizePageGoal(extractJsonObject(result.response.text()))
}

export async function generateLearningUnitGoal(unit) {
  const pages = Array.isArray(unit?.pages) ? unit.pages : []
  const text = pages
    .map((page) => `[p.${page.pageIndex + 1}]\n${String(page.text ?? '').trim().slice(0, 2200)}`)
    .join('\n\n')
    .trim()

  if (text.length < 120) {
    throw new Error('학습 단위 목표를 만들 텍스트가 부족합니다.')
  }

  const pageRange = `${unit.startPageIndex + 1}-${unit.endPageIndex + 1}p`
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.35 },
    systemInstruction: `당신은 학습자가 PDF를 능동적으로 읽도록 돕는 한국어 학습 코치입니다.
여러 페이지를 하나의 학습 흐름으로 보고, 중복 없는 학습 목표와 사고 질문을 만드세요.`,
  })

  const prompt = `다음 PDF ${pageRange} 구간을 하나의 학습 단위로 보고 오늘의 학습 목표를 만드세요.

규칙:
- 한국어로만 작성하세요.
- 페이지별 요약을 반복하지 말고, 이 구간 전체를 관통하는 읽기 방향을 제시하세요.
- mainObjective는 한 문장, 80자 이내로 작성하세요.
- objectives는 최대 3개, focusQuestions는 최대 2개, keywords는 최대 6개입니다.
- focusQuestions는 Chat 추천 질문으로 바로 쓸 수 있게 질문 문장으로 작성하세요.
- pageHints는 각 페이지에서 특히 볼 지점을 짧게 작성하세요.
- priority는 low, medium, high 중 하나입니다.
- JSON 객체만 출력하세요.

형식:
{
  "mainObjective": "...",
  "objectives": ["...", "..."],
  "focusQuestions": ["..."],
  "keywords": ["..."],
  "priority": "low|medium|high",
  "pageHints": {
    "${unit.startPageIndex}": "현재 페이지 포커스"
  },
  "pageOxQuestions": {
    "${unit.startPageIndex}": [
      {"statement":"이 페이지 내용만 근거로 판단할 수 있는 짧은 O/X 진술", "answer":"O|X", "explanation":"..."}
    ]
  }
}

학습 단위 텍스트:
${text.slice(0, 9000)}`

  const result = await model.generateContent(`${prompt}

추가 규칙:
- 페이지 이동 제한 팝업은 주관식이 아니라 O/X 선택식으로 동작합니다.
- JSON에 "oxQuestions" 배열을 반드시 포함하세요.
- oxQuestions는 1-2개이며, 각 항목은 {"statement":"...", "answer":"O|X", "explanation":"..."} 형식입니다.
- JSON에 "pageOxQuestions" 객체도 반드시 포함하세요.
- pageOxQuestions는 각 페이지 인덱스별 O/X 문항 배열입니다. 각 문항은 반드시 해당 페이지 텍스트만으로 풀 수 있어야 합니다.
- pageOxQuestions의 문항에는 뒤 페이지에서 처음 나오는 개념, 용어, 결론을 절대 넣지 마세요.
- statement는 학생이 직관적으로 O 또는 X를 고를 수 있는 짧은 진술문이어야 합니다.
- 너무 어렵거나 함정식 문항은 피하고, 방금 읽은 핵심 이해 여부만 확인하세요.`)
  return normalizeLearningUnitGoal(extractJsonObject(result.response.text()))
}

export async function generateQuizItems(text, scopeLabel = '선택한 범위', options = {}) {
  const source = String(text ?? '').trim()
  if (source.length < 40) {
    throw new Error('퀴즈를 만들 텍스트가 부족합니다.')
  }

  const avoidanceBlock = formatQuizAvoidanceBlock(options.history)
  const sourcePages = Array.isArray(options.sourcePageIndexes) && options.sourcePageIndexes.length > 0
    ? options.sourcePageIndexes.map((pageIndex) => `p.${pageIndex + 1}`).join(', ')
    : ''
  const generationIndex = Number.isFinite(options.generationIndex) ? options.generationIndex : 1

  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: avoidanceBlock ? 0.55 : 0.42,
    },
    systemInstruction: `당신은 학생이 PDF 내용을 스스로 점검하도록 돕는 한국어 학습 코치입니다.
반드시 제공된 텍스트에 근거해서만 퀴즈를 만들고, JSON 배열만 출력하세요.`,
  })

  const prompt = `다음 ${scopeLabel} 텍스트로 학습 퀴즈 후보를 만드세요.
${sourcePages ? `이번 생성에 사용된 근거 페이지: ${sourcePages}` : ''}
이번 생성 회차: ${generationIndex}

규칙:
- 한국어로 작성하세요.
- 총 6문항 후보를 만드세요. 앱이 중복 제거 후 4문항을 고릅니다.
- 후보에는 multiple_choice 3개, ox 2개, short_answer 1개를 섞으세요.
- 쉬운 정의 확인, 개념 비교, 적용 상황, 흔한 오개념 점검이 골고루 들어가야 합니다.
- multiple_choice는 choices 4개를 제공하고 answer에는 정답 선택지의 정확한 문자열을 넣으세요.
- ox는 choices를 비우고 answer에는 O 또는 X만 넣으세요.
- short_answer는 한두 단어 암기가 아니라 핵심 관계를 짧게 설명하게 만드세요.
- explanation은 왜 정답인지 1-2문장으로 설명하세요.
- 제공된 텍스트에서 확인 가능한 내용만 묻고, JSON 배열만 출력하세요.
${avoidanceBlock ? `\n${avoidanceBlock}\n` : ''}

형식:
[
  {
    "id": "q1",
    "type": "multiple_choice|ox|short_answer",
    "question": "...",
    "choices": ["...", "...", "...", "..."],
    "answer": "...",
    "explanation": "..."
  }
]

텍스트:
${source.slice(0, 9000)}`

  const result = await model.generateContent(prompt)
  return normalizeQuizItems(extractJsonArray(result.response.text()))
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
  // systemOverride: 선택사항 — system instruction 오버라이드 (citation 규칙 주입용)
  const ask = useCallback(async (selectedText, functionKey, ragBlock = '', systemOverride = null) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setResponse('')
    setError(null)
    setIsStreaming(true)

    const prompt = ragBlock + (QUICK_PROMPTS[functionKey] ?? QUICK_PROMPTS.explain)(selectedText)

    try {
      const model = systemOverride
        ? getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash-lite', systemInstruction: systemOverride })
        : getFlashLiteModel()
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
   * @param {string|null} systemOverride — system instruction 오버라이드 (선택, RAG 제약 주입용)
   */
  const chat = useCallback(async (history, userMessage, onChunk, onDone, onError, imageParts = [], systemOverride = null) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const model = systemOverride
        ? getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: systemOverride })
        : getFlashModel()
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

    // Pass 1 — 학습 흐름 노드 설계
    onProgress?.({ pass: 1, label: '학습 흐름 노드 설계 중…' })
    const r1 = await session.sendMessage(
      `다음 학습 자료를 "사용자가 개념 학습을 정리하는 논리 흐름도"로 만들기 위한 노드를 7~12개 설계하세요.
반드시 아래 JSON 배열 형식으로만 출력하세요 (다른 텍스트 없이):
[{"id":"root","label":"중심 주제(2~8자)","detail":"학습자가 이 자료에서 먼저 붙잡아야 할 관점","group":"root|core|process|structure|effect|example|application","importance":1|2|3,"level":0|1|2|3,"root":true|false}]

품질 기준:
- root:true이자 level:0인 루트 노드는 반드시 1개만 만드세요. id는 "root"를 사용하세요.
- level 1은 큰 분류/학습 질문, level 2는 하위 개념, level 3은 예시·결과·적용으로 구성하세요.
- label은 시험 직전 복습에 보이는 짧은 개념명이어야 합니다.
- detail은 "왜 중요한지/어떻게 이해할지"가 드러나는 1문장으로 쓰세요.
- 단순 키워드 나열이 아니라, 사용자가 왼쪽에서 오른쪽으로 읽으며 이해가 깊어지는 구조를 의도하세요.

group 기준: root=중심주제, core=핵심개념, process=과정·절차, structure=구조·구성요소, effect=결과·효과, example=예시, application=적용
importance: 3=가장 중요, 1=보조 개념

학습 자료:
${text}`
    )
    const nodesRaw = JSON.parse(r1.response.text())
    const nodes = Array.isArray(nodesRaw) ? nodesRaw : (nodesRaw.nodes ?? [])

    // Pass 2 — 좌에서 우로 읽히는 관계 분류
    onProgress?.({ pass: 2, label: '논리 관계 정렬 중…' })
    const r2 = await session.sendMessage(
      `위 개념들을 왼쪽 루트에서 오른쪽 하위 개념으로 펼쳐지는 방향 그래프로 연결하세요.
실제 텍스트에 근거가 있는 관계만 포함하세요.

관계 기준:
- 모든 edge는 낮은 level에서 높은 level로 향해야 합니다. 예: root(level 0) -> 큰 분류(level 1) -> 하위 개념(level 2).
- 모든 노드는 root에서 출발해 도달 가능해야 합니다.
- 순환 구조를 만들지 마세요.
- related는 꼭 필요한 보조 관계일 때만 쓰고, 가능한 contains/causes/exemplifies/contrasts 중 하나로 명확히 쓰세요.
- edge label은 "포함", "원인", "예시", "대비", "결과"처럼 2~8자의 짧은 한국어로 쓰세요.

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

    const validated = validateMindMapGraph({ nodes: enrichedNodes, edges }, { requireSources: true })
    if (!validated.ok) throw new Error('마인드맵 그래프가 비어 있습니다.')
    if (validated.warnings.length > 0 && import.meta.env.DEV) {
      console.warn('[useAI] mind map validation warnings', validated.warnings)
    }

    return {
      nodes: validated.nodes,
      edges: validated.edges,
      rootId: validated.rootId,
      quality: validated.quality,
      warnings: validated.warnings,
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

  return { response, isStreaming, error, ask, abort, reset, chat, generateMindMap, generateQuizItems }
}
