const DEFAULT_MAX_SOURCE_CHARS = 9000
const DEFAULT_TARGET_COUNT = 4
const DEFAULT_DUPLICATE_THRESHOLD = 0.68

export function normalizeQuizText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function charShingles(value, size = 2) {
  const normalized = normalizeQuizText(value).replace(/\s+/g, '')
  if (!normalized) return new Set()
  if (normalized.length <= size) return new Set([normalized])
  const shingles = new Set()
  for (let i = 0; i <= normalized.length - size; i += 1) {
    shingles.add(normalized.slice(i, i + size))
  }
  return shingles
}

export function similarityScore(left, right) {
  const a = normalizeQuizText(left)
  const b = normalizeQuizText(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length >= 10 && b.length >= 10 && (a.includes(b) || b.includes(a))) return 0.86

  const leftSet = charShingles(a)
  const rightSet = charShingles(b)
  if (leftSet.size === 0 || rightSet.size === 0) return 0

  let intersection = 0
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection += 1
  })
  const union = leftSet.size + rightSet.size - intersection
  return union > 0 ? intersection / union : 0
}

export function quizItemSimilarity(left, right) {
  if (!left || !right) return 0
  const questionSimilarity = similarityScore(left.question, right.question)
  const answerSimilarity = similarityScore(left.answer, right.answer)
  const combinedSimilarity = similarityScore(
    `${left.question ?? ''} ${left.answer ?? ''}`,
    `${right.question ?? ''} ${right.answer ?? ''}`
  )
  return Math.max(questionSimilarity, answerSimilarity * 0.72, combinedSimilarity * 0.9)
}

export function buildQuizHistory(sessions = [], {
  scope,
  sourceTextHash,
  pageNumber = null,
  limitSessions = 8,
} = {}) {
  const matchingSessions = sessions
    .filter((session) => {
      if (!session) return false
      if (scope && session.scope !== scope) return false
      if (scope === 'page' && pageNumber && session.pageNumber && session.pageNumber !== pageNumber) return false
      if (sourceTextHash && session.sourceTextHash && session.sourceTextHash !== sourceTextHash) return false
      return true
    })
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0, limitSessions)

  const items = matchingSessions.flatMap((session) => session.items ?? [])
  const sourcePageIndexes = matchingSessions.flatMap((session) => {
    if (Array.isArray(session.sourcePageIndexes)) return session.sourcePageIndexes
    if (Number.isFinite(session.pageNumber)) return [session.pageNumber - 1]
    return []
  })

  return {
    sessions: matchingSessions,
    items,
    sourcePageIndexes,
    sessionCount: matchingSessions.length,
  }
}

function countPageUse(pageIndexes = []) {
  return pageIndexes.reduce((acc, pageIndex) => {
    if (Number.isFinite(pageIndex)) acc.set(pageIndex, (acc.get(pageIndex) ?? 0) + 1)
    return acc
  }, new Map())
}

function chunkLength(chunk) {
  return String(chunk?.text ?? '').length + 18
}

export function selectQuizSourceChunks(chunks = [], {
  history = null,
  maxChars = DEFAULT_MAX_SOURCE_CHARS,
} = {}) {
  const cleanChunks = chunks
    .filter((chunk) => Number.isFinite(chunk?.pageIndex) && String(chunk?.text ?? '').trim())
    .map((chunk, index) => ({
      ...chunk,
      _sourceOrder: index,
      text: String(chunk.text).trim(),
    }))

  if (cleanChunks.length === 0) {
    return { text: '', pageIndexes: [] }
  }

  const pageUse = countPageUse(history?.sourcePageIndexes ?? [])
  const bandCount = Math.min(8, Math.max(1, Math.ceil(cleanChunks.length / 4)))
  const bands = Array.from({ length: bandCount }, () => [])

  cleanChunks.forEach((chunk, index) => {
    const bandIndex = Math.min(bandCount - 1, Math.floor(index * bandCount / cleanChunks.length))
    bands[bandIndex].push(chunk)
  })

  bands.forEach((band) => {
    band.sort((a, b) => {
      const useDelta = (pageUse.get(a.pageIndex) ?? 0) - (pageUse.get(b.pageIndex) ?? 0)
      if (useDelta !== 0) return useDelta
      return a.pageIndex - b.pageIndex || a._sourceOrder - b._sourceOrder
    })
  })

  const selected = []
  const selectedKeys = new Set()
  let totalChars = 0
  let madeProgress = true

  while (madeProgress) {
    madeProgress = false
    for (const band of bands) {
      const next = band.find((chunk) => !selectedKeys.has(`${chunk.pageIndex}:${chunk._sourceOrder}`))
      if (!next) continue

      const key = `${next.pageIndex}:${next._sourceOrder}`
      const length = chunkLength(next)
      if (selected.length > 0 && totalChars + length > maxChars) {
        selectedKeys.add(key)
        continue
      }

      selected.push(next)
      selectedKeys.add(key)
      totalChars += length
      madeProgress = true

      if (totalChars >= maxChars) break
    }
  }

  const finalChunks = selected.length > 0 ? selected : [cleanChunks[0]]
  const sorted = [...finalChunks].sort((a, b) => a.pageIndex - b.pageIndex || a._sourceOrder - b._sourceOrder)
  const text = sorted
    .map((chunk) => `[${chunk.pageIndex + 1}페이지]\n${chunk.text}`)
    .join('\n\n')
    .slice(0, maxChars)

  return {
    text,
    pageIndexes: [...new Set(sorted.map((chunk) => chunk.pageIndex))],
  }
}

export function formatQuizAvoidanceBlock(history = null, { limitItems = 14 } = {}) {
  const items = (history?.items ?? [])
    .filter((item) => item?.question)
    .slice(0, limitItems)

  if (items.length === 0 && !(history?.sourcePageIndexes?.length > 0)) return ''

  const previousQuestions = items
    .map((item, index) => {
      const answer = item.answer ? ` / 정답: ${String(item.answer).slice(0, 80)}` : ''
      return `${index + 1}. ${String(item.question).slice(0, 140)}${answer}`
    })
    .join('\n')

  const pages = [...new Set(history?.sourcePageIndexes ?? [])]
    .filter((pageIndex) => Number.isFinite(pageIndex))
    .sort((a, b) => a - b)
    .map((pageIndex) => `p.${pageIndex + 1}`)
    .join(', ')

  return `이전 퀴즈 회피 기준:
- 아래 문항과 같은 질문, 같은 정답 표현, 같은 핵심 개념 조합을 반복하지 마세요.
- 같은 개념을 다시 묻더라도 비교, 적용, 오개념 점검, 원인-결과처럼 다른 사고 조작으로 바꾸세요.
${pages ? `- 최근 사용한 근거 페이지: ${pages}. 가능하면 덜 사용한 페이지와 개념을 우선하세요.` : ''}
${previousQuestions ? `\n이전 문항:\n${previousQuestions}` : ''}`
}

export function filterNovelQuizItems(items = [], previousItems = [], {
  targetCount = DEFAULT_TARGET_COUNT,
  threshold = DEFAULT_DUPLICATE_THRESHOLD,
} = {}) {
  const accepted = []
  const rejected = []

  for (const item of items) {
    if (!item?.question || !item?.answer) continue
    const previousSimilarity = previousItems.reduce(
      (max, previous) => Math.max(max, quizItemSimilarity(item, previous)),
      0
    )
    const currentSimilarity = accepted.reduce(
      (max, previous) => Math.max(max, quizItemSimilarity(item, previous)),
      0
    )
    const maxSimilarity = Math.max(previousSimilarity, currentSimilarity)

    if (maxSimilarity >= threshold) {
      rejected.push({ item, similarity: maxSimilarity })
      continue
    }

    accepted.push(item)
    if (accepted.length >= targetCount) break
  }

  return {
    items: accepted,
    rejected,
    rejectedCount: rejected.length,
    requestedCount: items.length,
  }
}
