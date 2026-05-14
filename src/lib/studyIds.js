export function stableHash(value) {
  const source = String(value ?? '')
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function questionAnswerId(unitId, question) {
  return `${unitId || 'unit'}_${stableHash(question)}`
}
