export function stableHash(value) {
  const source = String(value ?? '')
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function questionAnswerId(unitId, question, pageIndex = null) {
  const pagePart = pageIndex == null ? 'all' : `p${pageIndex}`
  return `${unitId || 'unit'}_${pagePart}_${stableHash(question)}`
}

export function legacyQuestionAnswerId(unitId, question) {
  return `${unitId || 'unit'}_${stableHash(question)}`
}
