import assert from 'node:assert/strict'
import {
  buildQuizHistory,
  filterNovelQuizItems,
  formatQuizAvoidanceBlock,
  quizItemSimilarity,
  selectQuizSourceChunks,
} from '../src/lib/quizDiversity.js'

const chunks = Array.from({ length: 8 }, (_, index) => ({
  id: `p${index + 1}`,
  pageIndex: index,
  text: `Page ${index + 1} concept ${index + 1}. `.repeat(8),
}))

{
  const selected = selectQuizSourceChunks(chunks, { maxChars: 900 })
  assert.ok(selected.pageIndexes.length >= 4, 'all-scope source should sample multiple pages')
  assert.ok(selected.pageIndexes.includes(0), 'first band should be represented')
  assert.ok(selected.pageIndexes.some((pageIndex) => pageIndex >= 4), 'later document pages should be represented')
  assert.ok(selected.text.length <= 900, 'selected source should respect the prompt budget')
}

{
  const history = { sourcePageIndexes: [0, 2, 4, 6] }
  const selected = selectQuizSourceChunks(chunks, { history, maxChars: 700 })
  assert.ok(selected.pageIndexes.includes(1), 'recently unused page in first band should be preferred')
  assert.ok(selected.pageIndexes.includes(3), 'recently unused page in second band should be preferred')
  assert.ok(!selected.pageIndexes.includes(0), 'recently used pages should be deprioritized when alternatives fit')
}

const previousSessions = [
  {
    id: 'older',
    scope: 'all',
    sourceTextHash: 'same',
    createdAt: '2026-05-01T00:00:00.000Z',
    sourcePageIndexes: [0, 2],
    items: [
      {
        id: 'q-old',
        question: '활성화 함수는 신경망에서 어떤 역할을 하나요?',
        answer: '비선형성을 추가한다',
      },
    ],
  },
  {
    id: 'recent',
    scope: 'all',
    sourceTextHash: 'same',
    createdAt: '2026-05-02T00:00:00.000Z',
    sourcePageIndexes: [4, 6],
    items: [
      {
        id: 'q-recent',
        question: '오버피팅을 줄이는 대표적인 방법은 무엇인가요?',
        answer: '정규화와 드롭아웃',
      },
    ],
  },
]

{
  const history = buildQuizHistory(previousSessions, { scope: 'all', sourceTextHash: 'same' })
  assert.equal(history.sessions[0].id, 'recent', 'history should use newest sessions first')
  assert.equal(history.items.length, 2)
  assert.deepEqual(history.sourcePageIndexes, [4, 6, 0, 2])
}

{
  const repeated = {
    id: 'candidate-1',
    question: '활성화 함수는 신경망에서 무슨 역할을 하나요?',
    answer: '비선형성을 추가한다',
  }
  const novel = {
    id: 'candidate-2',
    question: '드롭아웃이 학습 과정에서 일반화에 도움을 주는 이유는 무엇인가요?',
    answer: '일부 뉴런을 무작위로 제외해 특정 경로 의존을 줄인다',
  }
  const similarity = quizItemSimilarity(repeated, previousSessions[0].items[0])
  assert.ok(similarity >= 0.68, 'near-duplicate quiz questions should be recognized')

  const filtered = filterNovelQuizItems([repeated, novel], previousSessions.flatMap((session) => session.items))
  assert.deepEqual(filtered.items.map((item) => item.id), ['candidate-2'])
  assert.equal(filtered.rejectedCount, 1)
}

{
  const block = formatQuizAvoidanceBlock(buildQuizHistory(previousSessions, { scope: 'all', sourceTextHash: 'same' }))
  assert.match(block, /이전 퀴즈 회피 기준/)
  assert.match(block, /오버피팅을 줄이는 대표적인 방법/)
  assert.match(block, /p\.5/)
}

console.log('Quiz diversity tests passed')
