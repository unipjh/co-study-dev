import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAuthStore from '../store/authStore'
import { questionAnswerId } from '../lib/studyIds'

function answersCol(uid, docId) {
  return collection(db, 'users', uid, 'documents', docId, 'questionAnswers')
}

export default function useLearningQuestionAnswers(docId) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [answers, setAnswers] = useState([])

  useEffect(() => {
    setAnswers([])
  }, [docId, uid])

  useEffect(() => {
    if (!uid || !docId) return
    const unsub = onSnapshot(answersCol(uid, docId), (snapshot) => {
      setAnswers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
    return unsub
  }, [uid, docId])

  const getAnswer = useCallback((unitId, question) => {
    const id = questionAnswerId(unitId, question)
    return answers.find((item) => item.id === id) ?? null
  }, [answers])

  const isResolved = useCallback((unitId, question) => {
    const answer = getAnswer(unitId, question)
    return answer?.status === 'answered' || answer?.status === 'skipped'
  }, [getAnswer])

  const unresolvedQuestions = useCallback((unit) => {
    const questions = unit?.focusQuestions?.filter(Boolean) ?? []
    if (!unit?.id || questions.length === 0) return []
    return questions.filter((question) => !isResolved(unit.id, question))
  }, [isResolved])

  const saveAnswer = useCallback(async ({ unitId, pageIndex, question, answer, status = 'answered', aiFeedback = null }) => {
    if (!uid || !docId || !unitId || !question) return null
    const id = questionAnswerId(unitId, question)
    const existing = answers.find((item) => item.id === id)
    const now = new Date().toISOString()
    const payload = {
      id,
      unitId,
      pageIndex: pageIndex ?? null,
      question,
      answer,
      status,
      aiFeedback: aiFeedback ?? existing?.aiFeedback ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await setDoc(doc(answersCol(uid, docId), id), payload)
    setAnswers((prev) => {
      const rest = prev.filter((item) => item.id !== id)
      return [...rest, payload]
    })
    return payload
  }, [uid, docId, answers])

  return useMemo(() => ({
    answers,
    getAnswer,
    isResolved,
    unresolvedQuestions,
    saveAnswer,
  }), [answers, getAnswer, isResolved, unresolvedQuestions, saveAnswer])
}
