const MIN_PAGES = 2
const MAX_PAGES = 5
const MIN_CHARS = 1200
const MAX_CHARS = 8000

const STRONG_HEADING_PATTERNS = [
  /^(chapter|section|unit|part)\s+\d+/i,
  /^\d+(\.\d+)*\.?\s+.{2,80}$/,
  /^[IVX]+\.\s+.{2,80}$/i,
  /^(개요|정의|원리|예시|문제|정리|요약|실습|연습문제|학습목표)\b/,
]

function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

function getFirstMeaningfulLine(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length >= 2 && line.length <= 90) ?? ''
}

function looksLikeHeadingStart(chunk) {
  const line = getFirstMeaningfulLine(chunk?.text)
  if (!line) return false
  return STRONG_HEADING_PATTERNS.some((pattern) => pattern.test(line))
}

function tokenize(text) {
  return new Set(
    normalizeText(text)
      .toLowerCase()
      .match(/[a-z0-9가-힣]{3,}/g)
      ?.filter((token) => token.length >= 3)
      .slice(0, 180) ?? []
  )
}

function tokenOverlap(a, b) {
  const left = tokenize(a)
  const right = tokenize(b)
  if (left.size === 0 || right.size === 0) return 1
  let intersection = 0
  left.forEach((token) => {
    if (right.has(token)) intersection += 1
  })
  return intersection / Math.min(left.size, right.size)
}

function makeUnit(pages) {
  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex)
  const startPageIndex = sorted[0].pageIndex
  const endPageIndex = sorted[sorted.length - 1].pageIndex
  return {
    id: `unit_${startPageIndex}_${endPageIndex}`,
    startPageIndex,
    endPageIndex,
    pageIndexes: sorted.map((page) => page.pageIndex),
    pages: sorted.map((page) => ({
      pageIndex: page.pageIndex,
      text: normalizeText(page.text),
    })),
  }
}

export function buildLearningUnitsFromChunks(chunks) {
  const pages = [...(chunks ?? [])]
    .filter((chunk) => Number.isFinite(chunk?.pageIndex))
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((chunk) => ({
      pageIndex: chunk.pageIndex,
      text: String(chunk.text ?? '').trim(),
    }))

  if (pages.length === 0) return []
  const firstPage = pages.find((page) => page.pageIndex === 0) ?? pages[0]
  const remainingPages = pages.filter((page) => page.pageIndex !== firstPage.pageIndex)

  const units = []
  units.push({
    ...makeUnit([firstPage]),
    id: `unit_${firstPage.pageIndex}_${firstPage.pageIndex}`,
    sourceScope: 'document-overview',
    pages: pages.map((page) => ({
      pageIndex: page.pageIndex,
      text: normalizeText(page.text),
    })),
  })

  let current = []
  let currentChars = 0

  for (let i = 0; i < remainingPages.length; i += 1) {
    const page = remainingPages[i]
    const next = remainingPages[i + 1]
    current.push(page)
    currentChars += page.text.length

    const pageCount = current.length
    const enoughPages = pageCount >= MIN_PAGES
    const nextStartsSection = next ? looksLikeHeadingStart(next) : false
    const lowContinuity = next && tokenOverlap(page.text, next.text) < 0.12
    const shouldClose =
      i === pages.length - 1 ||
      pageCount >= MAX_PAGES ||
      currentChars >= MAX_CHARS ||
      (enoughPages && currentChars >= MIN_CHARS && (nextStartsSection || lowContinuity))

    if (shouldClose) {
      units.push(makeUnit(current))
      current = []
      currentChars = 0
    }
  }

  if (units.length >= 2) {
    const last = units[units.length - 1]
    const prev = units[units.length - 2]
    if (last.pageIndexes.length === 1 && prev.pageIndexes.length < MAX_PAGES && prev.sourceScope !== 'document-overview') {
      const mergedPages = [...prev.pages, ...last.pages]
      units.splice(units.length - 2, 2, makeUnit(mergedPages))
    }
  }

  return units
}

export function findUnitForPage(units, pageIndex) {
  const matches = (units ?? []).filter((unit) =>
    unit.startPageIndex <= pageIndex && pageIndex <= unit.endPageIndex
  )
  return matches.find((unit) => unit.startPageIndex === pageIndex && unit.endPageIndex === pageIndex) ??
    matches.sort((a, b) => (a.endPageIndex - a.startPageIndex) - (b.endPageIndex - b.startPageIndex))[0] ??
    null
}

export function getNeighborUnits(units, pageIndex) {
  const list = units ?? []
  const index = list.findIndex((unit) =>
    unit.startPageIndex <= pageIndex && pageIndex <= unit.endPageIndex
  )
  if (index < 0) return []
  return [list[index - 1], list[index + 1]].filter(Boolean)
}
