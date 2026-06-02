export function normalizeGateQuestions(source) {
  const questions = Array.isArray(source) ? source : []
  return questions
    .map((item, index) => ({
      id: item?.id || `ox_${index + 1}`,
      statement: String(item?.statement || item?.question || '').trim(),
      answer: String(item?.answer || item?.correctAnswer || 'O').trim().toUpperCase() === 'X' ? 'X' : 'O',
      explanation: String(item?.explanation || '').trim(),
    }))
    .filter((item) => item.statement)
}

export function getGateQuestions(unit, pageIndex = null) {
  const pageKey = pageIndex == null ? null : String(pageIndex)
  const pageQuestions = pageKey && unit?.pageOxQuestions && typeof unit.pageOxQuestions === 'object'
    ? unit.pageOxQuestions[pageKey]
    : null
  const normalizedPageQuestions = normalizeGateQuestions(pageQuestions)
  if (pageKey) return normalizedPageQuestions

  const oxQuestions = Array.isArray(unit?.oxQuestions) ? unit.oxQuestions : []

  const normalized = normalizeGateQuestions(oxQuestions)
  if (normalized.length > 0) return normalized

  const legacyQuestions = unit?.focusQuestions?.filter(Boolean) ?? []
  return legacyQuestions.map((question, index) => ({
    id: `legacy_${index + 1}`,
    statement: question,
    answer: 'O',
    explanation: '이전 방식으로 생성된 질문입니다. 새로 생성하면 O/X 점검 문항으로 바뀝니다.',
    legacy: true,
  }))
}
