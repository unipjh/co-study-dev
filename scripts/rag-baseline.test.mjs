import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildContextPackage } from '../src/lib/ai/contextPipeline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(__dirname, 'fixtures', 'rag-golden-set.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'by',
  'does',
  'do',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'such',
  'the',
  'this',
  'to',
  'what',
  'when',
  'which',
  'why',
  'with',
])

function normalizeToken(token) {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(ing|ed|s)$/i, '')
}

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}

function scoreChunk(question, chunk) {
  const queryTokens = new Set(tokenize(question))
  const chunkTokens = new Set(tokenize(chunk.text))
  if (queryTokens.size === 0 || chunkTokens.size === 0) return 0

  let matches = 0
  queryTokens.forEach((token) => {
    if (chunkTokens.has(token)) matches += 1
  })

  return matches / queryTokens.size
}

function retrieve(question, chunks, topK) {
  return chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(question, chunk) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.pageIndex - b.pageIndex)
    .slice(0, topK)
}

function getChunkByPage(pageIndex) {
  return fixture.chunks.find((chunk) => chunk.pageIndex === pageIndex) ?? null
}

function intersects(left, right) {
  return left.some((value) => right.includes(value))
}

const summary = {
  total: fixture.cases.length,
  expectedHit: 0,
  noEvidencePass: 0,
  deicticPass: 0,
  selectionPass: 0,
  failures: [],
}

const results = fixture.cases.map((testCase) => {
  const semanticChunks = retrieve(testCase.question, fixture.chunks, fixture.topK)
  const currentPageChunk = Number.isFinite(testCase.currentPage)
    ? getChunkByPage(testCase.currentPage - 1)
    : null
  const contextPackage = buildContextPackage({
    userText: testCase.question,
    semanticChunks,
    selectedContexts: testCase.selectedContexts ?? [],
    currentPageChunk,
    getChunkByPage,
    scoreFloor: fixture.scoreFloor,
  })
  const allowedPages = [...contextPackage.allowedPageNums]
  const expectedPages = testCase.expectedPages ?? []
  const hit = expectedPages.length === 0
    ? allowedPages.length === 0
    : intersects(expectedPages, allowedPages)

  if (hit && expectedPages.length > 0) summary.expectedHit += 1
  if (testCase.type === 'no_evidence' && allowedPages.length === 0) summary.noEvidencePass += 1
  if (testCase.type === 'deictic' && allowedPages.includes(testCase.currentPage)) summary.deicticPass += 1
  if (testCase.type === 'selection' && intersects(expectedPages, allowedPages)) summary.selectionPass += 1

  if (!hit) {
    summary.failures.push({
      id: testCase.id,
      type: testCase.type,
      expectedPages,
      allowedPages,
      semanticPages: semanticChunks.map((chunk) => chunk.pageIndex + 1),
    })
  }

  return {
    id: testCase.id,
    type: testCase.type,
    expectedPages,
    allowedPages,
    semanticPages: semanticChunks.map((chunk) => chunk.pageIndex + 1),
    confidence: contextPackage.confidence,
    hit,
  }
})

const evidenceCases = fixture.cases.filter((testCase) => testCase.expectedPages.length > 0)
const noEvidenceCases = fixture.cases.filter((testCase) => testCase.type === 'no_evidence')
const deicticCases = fixture.cases.filter((testCase) => testCase.type === 'deictic')
const selectionCases = fixture.cases.filter((testCase) => testCase.type === 'selection')

const metrics = {
  expectedPageHitRate: summary.expectedHit / evidenceCases.length,
  noEvidencePassRate: summary.noEvidencePass / noEvidenceCases.length,
  deicticPassRate: summary.deicticPass / deicticCases.length,
  selectionPassRate: summary.selectionPass / selectionCases.length,
}

console.log('RAG baseline results')
console.table(results.map((result) => ({
  id: result.id,
  type: result.type,
  expected: result.expectedPages.join(',') || '-',
  allowed: result.allowedPages.join(',') || '-',
  semantic: result.semanticPages.join(',') || '-',
  confidence: result.confidence,
  hit: result.hit,
})))
console.log('Metrics:', {
  expectedPageHitRate: `${Math.round(metrics.expectedPageHitRate * 100)}%`,
  noEvidencePassRate: `${Math.round(metrics.noEvidencePassRate * 100)}%`,
  deicticPassRate: `${Math.round(metrics.deicticPassRate * 100)}%`,
  selectionPassRate: `${Math.round(metrics.selectionPassRate * 100)}%`,
})

assert.equal(summary.failures.length, 0, `RAG baseline failures: ${JSON.stringify(summary.failures, null, 2)}`)
assert.ok(metrics.expectedPageHitRate >= 0.8, 'expected page hit rate should be at least 80%')
assert.ok(metrics.noEvidencePassRate >= 0.9, 'no-evidence pass rate should be at least 90%')
assert.ok(metrics.deicticPassRate >= 0.9, 'deictic current-page inclusion should be at least 90%')
assert.ok(metrics.selectionPassRate >= 0.9, 'selection anchor inclusion should be at least 90%')

console.log('RAG baseline tests passed')
