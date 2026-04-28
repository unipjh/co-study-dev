import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAuthStore from '../store/authStore'
import { generatePageGoal } from '../components/AI/useAI'

const MIN_TEXT_CHARS = 80

function goalsCol(uid, docId) {
  return collection(db, 'users', uid, 'documents', docId, 'pageGoals')
}

function simpleHash(text) {
  let hash = 0
  const source = String(text ?? '')
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
  }
  return String(hash)
}

function normalizeError(err) {
  return err?.message || '학습 목표를 만들지 못했습니다.'
}

export default function usePageGoals(docId) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [goalsByPage, setGoalsByPage] = useState({})
  const [generatingByPage, setGeneratingByPage] = useState({})
  const [errorsByPage, setErrorsByPage] = useState({})
  const generatingPageIndexes = useRef(new Set())

  useEffect(() => {
    setGoalsByPage({})
    setGeneratingByPage({})
    setErrorsByPage({})
    generatingPageIndexes.current.clear()
  }, [docId, uid])

  useEffect(() => {
    if (!uid || !docId) return
    const unsub = onSnapshot(goalsCol(uid, docId), (snapshot) => {
      const next = {}
      snapshot.docs.forEach((item) => {
        const data = item.data()
        next[data.pageIndex ?? Number(item.id)] = data
      })
      setGoalsByPage(next)
    })
    return unsub
  }, [uid, docId])

  const getGoal = useCallback((pageIndex) => {
    return goalsByPage[pageIndex] ?? null
  }, [goalsByPage])

  const writeGoal = useCallback(async (pageIndex, pageText, neighborText = '', options = {}) => {
    if (!uid || !docId) return null
    const text = String(pageText ?? '').trim()
    if (text.length < MIN_TEXT_CHARS) {
      const message = '이 페이지는 목표를 만들 텍스트가 부족합니다.'
      setErrorsByPage((prev) => ({ ...prev, [pageIndex]: message }))
      return null
    }
    if (generatingPageIndexes.current.has(pageIndex)) return goalsByPage[pageIndex] ?? null

    generatingPageIndexes.current.add(pageIndex)
    setGeneratingByPage((prev) => ({ ...prev, [pageIndex]: true }))
    setErrorsByPage((prev) => ({ ...prev, [pageIndex]: null }))

    try {
      const generated = await generatePageGoal(text, pageIndex, neighborText)
      const now = new Date().toISOString()
      const nextGoal = {
        pageIndex,
        ...generated,
        completed: false,
        dismissed: false,
        sourceTextHash: simpleHash(text),
        generatedAt: now,
        updatedAt: now,
      }
      await setDoc(doc(goalsCol(uid, docId), String(pageIndex)), nextGoal)
      setGoalsByPage((prev) => ({ ...prev, [pageIndex]: nextGoal }))
      return nextGoal
    } catch (err) {
      setErrorsByPage((prev) => ({ ...prev, [pageIndex]: normalizeError(err) }))
      if (options.keepExisting !== false) return goalsByPage[pageIndex] ?? null
      return null
    } finally {
      generatingPageIndexes.current.delete(pageIndex)
      setGeneratingByPage((prev) => ({ ...prev, [pageIndex]: false }))
    }
  }, [uid, docId, goalsByPage])

  const ensureGoal = useCallback(async (pageIndex, pageText, neighborText = '') => {
    if (pageIndex == null || pageIndex < 0) return null
    const existing = goalsByPage[pageIndex]
    const sourceTextHash = simpleHash(pageText)
    if (existing && existing.sourceTextHash === sourceTextHash) return existing
    return writeGoal(pageIndex, pageText, neighborText)
  }, [goalsByPage, writeGoal])

  const prefetchGoals = useCallback((items) => {
    const list = Array.isArray(items) ? items : []
    list.forEach((item) => {
      if (!item || item.pageIndex == null) return
      if (goalsByPage[item.pageIndex] || generatingPageIndexes.current.has(item.pageIndex)) return
      ensureGoal(item.pageIndex, item.pageText, item.neighborText)
    })
  }, [goalsByPage, ensureGoal])

  const toggleComplete = useCallback(async (pageIndex) => {
    if (!uid || !docId) return
    const current = goalsByPage[pageIndex]
    if (!current) return
    const updated = {
      ...current,
      completed: !current.completed,
      updatedAt: new Date().toISOString(),
    }
    await setDoc(doc(goalsCol(uid, docId), String(pageIndex)), updated)
    setGoalsByPage((prev) => ({ ...prev, [pageIndex]: updated }))
  }, [uid, docId, goalsByPage])

  const regenerateGoal = useCallback(async (pageIndex, pageText, neighborText = '') => {
    return writeGoal(pageIndex, pageText, neighborText, { keepExisting: true })
  }, [writeGoal])

  return useMemo(() => ({
    goalsByPage,
    generatingByPage,
    errorsByPage,
    getGoal,
    ensureGoal,
    prefetchGoals,
    toggleComplete,
    regenerateGoal,
  }), [
    goalsByPage,
    generatingByPage,
    errorsByPage,
    getGoal,
    ensureGoal,
    prefetchGoals,
    toggleComplete,
    regenerateGoal,
  ])
}
