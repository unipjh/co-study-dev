import assert from 'node:assert/strict'
import {
  buildPageChunks,
  buildParagraphChunks,
  summarizeChunking,
} from '../src/lib/chunking.js'

const pages = [
  {
    pageIndex: 0,
    text: [
      'Neural networks are models made of layers, weights, and activation functions.',
      'They learn patterns from data and produce predictions.',
      '',
      'A feedforward network passes values from input to hidden layers and then to output.',
      'This structure does not use cycles.',
      '',
      'Short note.',
    ].join('\n'),
  },
  {
    pageIndex: 1,
    text: 'Backpropagation computes gradients. It updates weights. Regularization reduces overfitting by limiting model complexity.',
  },
]

{
  const chunks = buildPageChunks(pages, { maxChars: 80 })
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].type, 'page')
  assert.equal(chunks[0].text.length, 80)
  assert.deepEqual(chunks.map((chunk) => chunk.id), ['p1', 'p2'])
}

{
  const chunks = buildParagraphChunks(pages, {
    maxChars: 130,
    minChars: 40,
    overlapChars: 20,
  })
  assert.ok(chunks.length > pages.length, 'paragraph chunking should create more granular chunks than page chunking')
  assert.ok(chunks.every((chunk) => chunk.type === 'paragraph'))
  assert.ok(chunks.every((chunk) => chunk.text.length <= 130))
  assert.ok(chunks.some((chunk) => chunk.pageIndex === 0 && /feedforward network/.test(chunk.text)))
  assert.ok(chunks.some((chunk) => chunk.pageIndex === 1 && /Regularization reduces overfitting/.test(chunk.text)))
}

{
  const longPage = [{
    pageIndex: 2,
    text: 'token '.repeat(260),
  }]
  const chunks = buildParagraphChunks(longPage, {
    maxChars: 220,
    overlapChars: 30,
    minChars: 80,
  })
  assert.ok(chunks.length > 1, 'long text should be split into multiple chunks')
  assert.ok(chunks.every((chunk) => chunk.text.length <= 220))
}

{
  const chunks = buildParagraphChunks(pages, {
    maxChars: 130,
    minChars: 40,
  })
  const summary = summarizeChunking(chunks)
  assert.equal(summary.pageCount, 2)
  assert.equal(summary.chunkCount, chunks.length)
  assert.ok(summary.averageChars > 0)
}

console.log('Chunking tests passed')
