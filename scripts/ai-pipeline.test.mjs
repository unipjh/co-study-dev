import assert from 'node:assert/strict'
import {
  buildContextPackage,
  classifyEvidenceStatus,
  composePrompt,
  formatSelectedContext,
  shouldIncludeCurrentPage,
  validateAIResponse,
} from '../src/lib/ai/contextPipeline.js'

const chunks = [
  {
    pageIndex: 0,
    text: 'Machine learning uses data patterns to make predictions. 기계학습은 데이터를 바탕으로 예측을 만든다.',
    score: 0.44,
  },
  {
    pageIndex: 1,
    text: '지도학습은 입력과 정답 쌍을 이용해 모델을 학습시키는 방법이다.',
    score: 0.51,
  },
  {
    pageIndex: 2,
    text: '강화학습은 보상 신호를 통해 행동 정책을 개선한다.',
    score: 0.12,
  },
]

function getChunkByPage(pageIndex) {
  return chunks.find((chunk) => chunk.pageIndex === pageIndex) ?? null
}

{
  const include = shouldIncludeCurrentPage({
    userText: '지도학습이 뭐야?',
    currentPageChunk: getChunkByPage(0),
    semanticChunks: [chunks[1]],
  })
  assert.equal(include, false, 'irrelevant current page should not be forced into context')
}

{
  const include = shouldIncludeCurrentPage({
    userText: '이 페이지 내용을 쉽게 설명해줘',
    currentPageChunk: getChunkByPage(0),
    semanticChunks: [chunks[1]],
  })
  assert.equal(include, true, 'deictic questions should include the current page')
}

{
  const include = shouldIncludeCurrentPage({
    userText: 'What are data patterns?',
    currentPageChunk: getChunkByPage(0),
    semanticChunks: [],
  })
  assert.equal(include, true, 'lexical overlap should include current page when semantic search is empty')
}

{
  const contextPackage = buildContextPackage({
    userText: '지도학습을 설명해줘',
    semanticChunks: [chunks[1], chunks[2]],
    selectedContexts: [],
    currentPageChunk: getChunkByPage(0),
    getChunkByPage,
  })
  assert.deepEqual([...contextPackage.allowedPageNums], [2], 'low-score chunks and unrelated current page should be excluded')
  assert.equal(contextPackage.confidence, 'medium')
}

{
  const selectedContexts = [{ pageIndex: 0, text: '패턴을 학습하고 예측을 만든다', content: '중요', type: 'text' }]
  const contextPackage = buildContextPackage({
    userText: '선택한 부분 설명해줘',
    semanticChunks: [chunks[1]],
    selectedContexts,
    currentPageChunk: getChunkByPage(0),
    getChunkByPage,
  })
  const selectedText = formatSelectedContext(selectedContexts)
  const prompt = composePrompt({ userText: '선택한 부분 설명해줘', selectedContexts, contextPackage })

  assert.match(selectedText, /패턴을 학습하고 예측을 만든다/)
  assert.match(selectedText, /\[메모\] 중요/)
  assert.match(prompt.fullPrompt, /\[선택 맥락\]/)
  assert.match(prompt.fullPrompt, /\[문서 컨텍스트 - p\.1, p\.2\]/)
  assert.deepEqual([...prompt.allowedPageNums], [1, 2])
  assert.equal(contextPackage.confidence, 'high')
}

{
  const selectedContexts = [{ pageIndex: 1, type: 'region', imageData: 'base64data', content: '도식' }]
  const selectedText = formatSelectedContext(selectedContexts)
  assert.match(selectedText, /\[영역 선택 이미지, p\.2\]/)
  assert.match(selectedText, /\[메모\] 도식/)
}

{
  const checked = validateAIResponse('좋은 설명입니다. [p.2] 잘못된 인용 [p.9]', new Set([2]), { hasEvidence: true })
  assert.equal(checked.text.includes('[p.9]'), false, 'invalid citations should be stripped')
  assert.deepEqual(checked.citedPages, [2])
  assert.equal(checked.ok, true)
}

{
  const checked = validateAIResponse('일반적으로는 이런 배경이 있습니다.', new Set(), { hasEvidence: false })
  assert.equal(checked.ok, false)
  assert.deepEqual(checked.warnings, ['missing_no_evidence_notice'])
}

{
  const checked = validateAIResponse('교안 근거로는 확인되지 않지만 일반적으로는 이런 배경이 있습니다.', new Set(), {
    hasEvidence: false,
  })
  const status = classifyEvidenceStatus(checked, { hasEvidence: false, confidence: 'none' })
  assert.equal(checked.ok, true)
  assert.equal(status.status, 'none')
  assert.equal(status.label, '문서 근거 없음')
}

{
  const checked = validateAIResponse('지도학습은 정답 쌍으로 학습합니다. [p.2]', new Set([2]), { hasEvidence: true })
  const status = classifyEvidenceStatus(checked, { hasEvidence: true, confidence: 'high' })
  assert.equal(status.status, 'grounded')
  assert.deepEqual(status.pages, [2])
}

{
  const checked = validateAIResponse('지도학습은 정답 쌍으로 학습합니다.', new Set([2]), { hasEvidence: true })
  const status = classifyEvidenceStatus(checked, { hasEvidence: true, confidence: 'medium' })
  assert.deepEqual(checked.warnings, ['missing_citation'])
  assert.equal(status.status, 'weak')
}

console.log('AI pipeline tests passed')
