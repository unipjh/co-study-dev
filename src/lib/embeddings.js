/**
 * 코사인 유사도 — 두 벡터의 방향 유사도 (−1 ~ 1)
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 쿼리 벡터와 가장 유사한 상위 K개 청크 반환
 * @param {number[]} queryVec
 * @param {Array<{pageIndex: number, text: string, embedding: number[]}>} chunks
 * @param {number} k
 * @returns {Array<{pageIndex, text, embedding, score}>}
 */
export function findTopK(queryVec, chunks, k = 5) {
  return chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryVec, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
