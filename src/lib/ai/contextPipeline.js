import { buildRagSystemInstruction, NO_CHUNK_FALLBACK } from './promptContracts.js'

const DEICTIC_RE = /(이\s*(페이지|부분|내용|문장|그림)|여기|방금|선택한|현재\s*페이지|this\s*(page|part|section)|above|selected)/i
const DEFAULT_SCORE_FLOOR = 0.18

function pageNumber(chunk) {
  return Number(chunk.pageIndex) + 1
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function tokenizeKoreanish(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

export function hasLexicalOverlap(a, b) {
  const left = new Set(tokenizeKoreanish(a))
  if (left.size === 0) return false
  return tokenizeKoreanish(b).some((token) => left.has(token))
}

export function shouldIncludeCurrentPage({
  userText,
  selectedContexts = [],
  currentPageChunk,
  semanticChunks = [],
  intent = 'chat',
}) {
  if (!currentPageChunk) return false
  if (intent === 'quick_explain') return true
  if (DEICTIC_RE.test(normalizeText(userText))) return true

  const currentPageIndex = currentPageChunk.pageIndex
  const hasSelectedOnCurrentPage = selectedContexts.some((item) => item.pageIndex === currentPageIndex)
  if (hasSelectedOnCurrentPage) return true

  const strongSemanticHit = semanticChunks.some(
    (chunk) => chunk.pageIndex === currentPageIndex && (chunk.score == null || chunk.score >= DEFAULT_SCORE_FLOOR),
  )
  if (strongSemanticHit) return true

  if (semanticChunks.length === 0 && hasLexicalOverlap(userText, currentPageChunk.text)) return true

  return false
}

function mergeChunk(target, chunk, source) {
  if (!chunk || chunk.pageIndex == null) return
  const existing = target.get(chunk.pageIndex)
  if (!existing) {
    target.set(chunk.pageIndex, {
      ...chunk,
      sources: [source],
    })
    return
  }
  existing.sources = Array.from(new Set([...(existing.sources ?? []), source]))
  existing.score = Math.max(existing.score ?? 0, chunk.score ?? 0)
}

export function buildContextPackage({
  userText,
  intent = 'chat',
  semanticChunks = [],
  selectedContexts = [],
  currentPageChunk = null,
  getChunkByPage,
  scoreFloor = DEFAULT_SCORE_FLOOR,
}) {
  const chunkMap = new Map()
  const filteredSemanticChunks = semanticChunks.filter((chunk) => chunk.score == null || chunk.score >= scoreFloor)

  filteredSemanticChunks.forEach((chunk) => mergeChunk(chunkMap, chunk, 'semantic_match'))

  selectedContexts
    .filter((item) => item.pageIndex != null)
    .forEach((item) => mergeChunk(chunkMap, getChunkByPage?.(item.pageIndex), 'selection_anchor'))

  if (shouldIncludeCurrentPage({
    userText,
    selectedContexts,
    currentPageChunk,
    semanticChunks: filteredSemanticChunks,
    intent,
  })) {
    mergeChunk(chunkMap, currentPageChunk, 'current_page_hint')
  }

  const chunks = [...chunkMap.values()].sort((a, b) => a.pageIndex - b.pageIndex)
  const allowedPageNums = new Set(chunks.map(pageNumber))
  const availablePages = chunks.map((chunk) => `p.${pageNumber(chunk)}`).join(', ')
  const confidence = chunks.length === 0
    ? 'none'
    : selectedContexts.length > 0 || filteredSemanticChunks.length >= 2
      ? 'high'
      : 'medium'

  return {
    chunks,
    availablePages,
    allowedPageNums,
    confidence,
    hasEvidence: chunks.length > 0,
  }
}

export function formatSelectedContext(selectedContexts = []) {
  if (selectedContexts.length === 0) return null
  return selectedContexts.map((item, index) => {
    const page = item.pageIndex != null ? `p.${item.pageIndex + 1}` : 'page unknown'
    const isRegion = item.type === 'region'
    const label = isRegion
      ? item.imageData ? `[영역 선택 이미지, ${page}]` : `[영역 선택, ${page}]`
      : `"${normalizeText(item.text)}" (${page})`
    const memo = item.content ? `\n   [메모] ${item.content}` : ''
    return `${index + 1}. ${label}${memo}`
  }).join('\n')
}

export function composePrompt({ userText, selectedContexts = [], contextPackage }) {
  const selectedBlock = formatSelectedContext(selectedContexts)
  const ragBlock = contextPackage?.chunks?.length > 0
    ? `[문서 컨텍스트 - ${contextPackage.availablePages}]\n` +
      contextPackage.chunks
        .map((chunk) => {
          const sourceHint = chunk.sources?.length ? ` source=${chunk.sources.join('+')}` : ''
          return `(p.${pageNumber(chunk)}${sourceHint}) ${chunk.text}`
        })
        .join('\n') +
      '\n---\n'
    : ''

  const fullPrompt = selectedBlock
    ? `${ragBlock}[선택 맥락]\n${selectedBlock}\n\n[사용자 질문]\n${userText}`
    : `${ragBlock}[사용자 질문]\n${userText}`

  const systemInstruction = contextPackage?.chunks?.length > 0
    ? buildRagSystemInstruction(contextPackage.availablePages)
    : NO_CHUNK_FALLBACK

  return {
    fullPrompt,
    systemInstruction,
    ragBlock,
    allowedPageNums: contextPackage?.allowedPageNums ?? new Set(),
  }
}

export function stripInvalidCitations(text, allowedPageNums) {
  if (!allowedPageNums || allowedPageNums.size === 0) return text
  return String(text ?? '').replace(/\[p\.(\d+)\]/g, (match, num) =>
    allowedPageNums.has(Number(num)) ? match : '',
  )
}

export function validateAIResponse(text, allowedPageNums, { hasEvidence = false } = {}) {
  const cleaned = stripInvalidCitations(text, allowedPageNums).replace(/[ \t]+\n/g, '\n').trim()
  const citedPages = [...cleaned.matchAll(/\[p\.(\d+)\]/g)].map((match) => Number(match[1]))
  const invalidCitations = citedPages.filter((page) => allowedPageNums?.size && !allowedPageNums.has(page))
  const warnings = []

  if (!cleaned) warnings.push('empty_response')
  if (hasEvidence && citedPages.length === 0) warnings.push('missing_citation')
  if (invalidCitations.length > 0) warnings.push('invalid_citation')
  if (!hasEvidence && !/^교안 근거로는 확인되지 않지만/.test(cleaned)) {
    warnings.push('missing_no_evidence_notice')
  }

  return {
    text: cleaned,
    citedPages,
    warnings,
    ok: warnings.length === 0,
  }
}

export function classifyEvidenceStatus(checkedResponse, contextPackage = {}) {
  const warnings = checkedResponse?.warnings ?? []
  const citedPages = checkedResponse?.citedPages ?? []

  if (!contextPackage.hasEvidence) {
    return {
      status: 'none',
      label: '문서 근거 없음',
      description: '검색된 문서 근거 없이 일반 배경지식과 추정을 구분해 답변했습니다.',
      pages: [],
      warnings,
    }
  }

  if (citedPages.length > 0 && warnings.length === 0 && contextPackage.confidence === 'high') {
    return {
      status: 'grounded',
      label: '문서 근거 있음',
      description: '선택 맥락 또는 여러 문서 근거를 바탕으로 답변했습니다.',
      pages: citedPages,
      warnings,
    }
  }

  if (citedPages.length > 0) {
    return {
      status: 'partial',
      label: '근거 일부 확인',
      description: '문서 근거가 포함됐지만 맥락이 제한적일 수 있습니다.',
      pages: citedPages,
      warnings,
    }
  }

  return {
    status: 'weak',
    label: '근거 약함',
    description: '문서 컨텍스트는 있었지만 답변에 페이지 인용이 없습니다.',
    pages: [],
    warnings,
  }
}
