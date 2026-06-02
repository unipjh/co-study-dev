const DEFAULT_MAX_CHARS = 900
const DEFAULT_OVERLAP_CHARS = 120
const DEFAULT_MIN_CHARS = 120

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function splitParagraphs(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return []

  const paragraphBreaks = raw
    .split(/\n{2,}/)
    .map(normalizeText)
    .filter(Boolean)

  if (paragraphBreaks.length > 1) return paragraphBreaks

  return raw
    .split(/(?<=[.!?])\s+/)
    .map(normalizeText)
    .filter(Boolean)
}

function splitLongText(text, maxChars, overlapChars) {
  const normalized = normalizeText(text)
  if (normalized.length <= maxChars) return [normalized]

  const chunks = []
  let start = 0

  while (start < normalized.length) {
    const hardEnd = Math.min(start + maxChars, normalized.length)
    const window = normalized.slice(start, hardEnd)
    const lastSpace = window.lastIndexOf(' ')
    const end = hardEnd < normalized.length && lastSpace > Math.floor(maxChars * 0.65)
      ? start + lastSpace
      : hardEnd

    chunks.push(normalized.slice(start, end).trim())
    if (end >= normalized.length) break
    start = Math.max(start + 1, end - overlapChars)
  }

  return chunks.filter(Boolean)
}

export function buildPageChunks(pages, { maxChars = 2000 } = {}) {
  return (pages ?? [])
    .filter((page) => Number.isFinite(page?.pageIndex))
    .map((page) => ({
      id: `p${page.pageIndex + 1}`,
      pageIndex: page.pageIndex,
      chunkIndex: 0,
      type: 'page',
      text: normalizeText(page.text).slice(0, maxChars),
    }))
    .filter((chunk) => chunk.text)
}

export function buildParagraphChunks(
  pages,
  {
    maxChars = DEFAULT_MAX_CHARS,
    overlapChars = DEFAULT_OVERLAP_CHARS,
    minChars = DEFAULT_MIN_CHARS,
  } = {},
) {
  const chunks = []
  const pageChunkCounts = new Map()

  function nextChunkMeta(pageIndex) {
    const current = pageChunkCounts.get(pageIndex) ?? 0
    pageChunkCounts.set(pageIndex, current + 1)
    return {
      id: `p${pageIndex + 1}-c${current + 1}`,
      chunkIndex: current,
    }
  }

  for (const page of pages ?? []) {
    if (!Number.isFinite(page?.pageIndex)) continue

    const paragraphs = splitParagraphs(page.text)
    let buffer = ''

    function flushBuffer() {
      const text = normalizeText(buffer)
      if (!text) return
      splitLongText(text, maxChars, overlapChars).forEach((part) => {
        const meta = nextChunkMeta(page.pageIndex)
        chunks.push({
          id: meta.id,
          pageIndex: page.pageIndex,
          chunkIndex: meta.chunkIndex,
          type: 'paragraph',
          text: part,
        })
      })
      buffer = ''
    }

    for (const paragraph of paragraphs) {
      const next = buffer ? `${buffer} ${paragraph}` : paragraph
      if (next.length >= maxChars) {
        flushBuffer()
        buffer = paragraph
      } else if (paragraph.length < minChars) {
        buffer = next
      } else {
        buffer = next
        flushBuffer()
      }
    }

    flushBuffer()
  }

  return chunks
}

export function summarizeChunking(chunks) {
  const list = chunks ?? []
  const lengths = list.map((chunk) => chunk.text?.length ?? 0)
  const totalChars = lengths.reduce((sum, length) => sum + length, 0)
  const pages = new Set(list.map((chunk) => chunk.pageIndex))

  return {
    chunkCount: list.length,
    pageCount: pages.size,
    averageChars: list.length ? Math.round(totalChars / list.length) : 0,
    maxChars: lengths.length ? Math.max(...lengths) : 0,
    minChars: lengths.length ? Math.min(...lengths) : 0,
  }
}
