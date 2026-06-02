import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAuthStore from '../store/authStore'
import { generateLearningUnitGoal } from '../components/AI/useAI'
import { buildLearningUnitsFromChunks, findUnitForPage, getNeighborUnits } from '../lib/learningUnits'

function unitsCol(uid, docId) {
  return collection(db, 'users', uid, 'documents', docId, 'learningUnits')
}

function simpleHash(text) {
  let hash = 0
  const source = String(text ?? '')
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
  }
  return String(hash)
}

function unitSourceText(unit) {
  return (unit?.pages ?? [])
    .map((page) => `${page.pageIndex}:${page.text}`)
    .join('\n---\n')
}

function normalizeError(err) {
  return err?.message || '학습 목표를 만들지 못했습니다.'
}

function unitIdFor(candidate) {
  return `unit_${candidate.startPageIndex}_${candidate.endPageIndex}`
}

export default function useLearningUnits(docId) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [units, setUnits] = useState([])
  const [generatingByUnit, setGeneratingByUnit] = useState({})
  const [errorsByUnit, setErrorsByUnit] = useState({})
  const generatingUnitIds = useRef(new Set())

  useEffect(() => {
    setUnits([])
    setGeneratingByUnit({})
    setErrorsByUnit({})
    generatingUnitIds.current.clear()
  }, [docId, uid])

  useEffect(() => {
    if (!uid || !docId) return
    const unsub = onSnapshot(unitsCol(uid, docId), (snapshot) => {
      const next = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (a.startPageIndex - b.startPageIndex) || (a.endPageIndex - b.endPageIndex))
      setUnits(next)
    })
    return unsub
  }, [uid, docId])

  const getUnitForPage = useCallback((pageIndex) => {
    return findUnitForPage(units, pageIndex)
  }, [units])

  const writeUnit = useCallback(async (candidate, options = {}) => {
    if (!uid || !docId || !candidate) return null
    const id = unitIdFor(candidate)
    const sourceTextHash = simpleHash(unitSourceText(candidate))
    const existing = units.find((unit) => unit.id === id || (
      unit.startPageIndex === candidate.startPageIndex &&
      unit.endPageIndex === candidate.endPageIndex
    ))

    const hasPageOxQuestions = existing?.pageOxQuestions &&
      typeof existing.pageOxQuestions === 'object' &&
      Object.keys(existing.pageOxQuestions).length > 0
    if (!options.force && existing?.sourceTextHash === sourceTextHash && hasPageOxQuestions) return existing
    if (generatingUnitIds.current.has(id)) return existing ?? null

    generatingUnitIds.current.add(id)
    setGeneratingByUnit((prev) => ({ ...prev, [id]: true }))
    setErrorsByUnit((prev) => ({ ...prev, [id]: null }))

    try {
      const generated = await generateLearningUnitGoal(candidate)
      const now = new Date().toISOString()
      const nextUnit = {
        id,
        startPageIndex: candidate.startPageIndex,
        endPageIndex: candidate.endPageIndex,
        pageIndexes: candidate.pageIndexes,
        ...generated,
        completed: false,
        completedPages: existing?.completedPages ?? {},
        dismissed: false,
        sourceTextHash,
        generatedAt: now,
        updatedAt: now,
      }
      await setDoc(doc(unitsCol(uid, docId), id), nextUnit)
      setUnits((prev) => {
        const rest = prev.filter((unit) => unit.id !== id)
        return [...rest, nextUnit].sort((a, b) => (a.startPageIndex - b.startPageIndex) || (a.endPageIndex - b.endPageIndex))
      })
      return nextUnit
    } catch (err) {
      setErrorsByUnit((prev) => ({ ...prev, [id]: normalizeError(err) }))
      return existing ?? null
    } finally {
      generatingUnitIds.current.delete(id)
      setGeneratingByUnit((prev) => ({ ...prev, [id]: false }))
    }
  }, [uid, docId, units])

  const ensureUnitForPage = useCallback(async (pageIndex, chunks) => {
    const candidates = buildLearningUnitsFromChunks(chunks)
    const candidate = findUnitForPage(candidates, pageIndex)
    if (!candidate) return null
    return writeUnit(candidate)
  }, [writeUnit])

  const prefetchUnitsAroundPage = useCallback((pageIndex, chunks) => {
    const candidates = buildLearningUnitsFromChunks(chunks)
    getNeighborUnits(candidates, pageIndex).forEach((candidate) => {
      const id = unitIdFor(candidate)
      if (units.some((unit) => unit.id === id) || generatingUnitIds.current.has(id)) return
      writeUnit(candidate)
    })
  }, [units, writeUnit])

  const toggleUnitComplete = useCallback(async (unitId) => {
    if (!uid || !docId || !unitId) return
    const current = units.find((unit) => unit.id === unitId)
    if (!current) return
    const updated = {
      ...current,
      completed: !current.completed,
      updatedAt: new Date().toISOString(),
    }
    await setDoc(doc(unitsCol(uid, docId), unitId), updated)
    setUnits((prev) => prev.map((unit) => unit.id === unitId ? updated : unit))
  }, [uid, docId, units])

  const regenerateUnit = useCallback(async (unitId, chunks) => {
    const current = units.find((unit) => unit.id === unitId)
    if (!current) return null
    const candidates = buildLearningUnitsFromChunks(chunks)
    const candidate = candidates.find((unit) =>
      unit.startPageIndex === current.startPageIndex &&
      unit.endPageIndex === current.endPageIndex
    )
    return writeUnit(candidate, { force: true })
  }, [units, writeUnit])

  return useMemo(() => ({
    units,
    generatingByUnit,
    errorsByUnit,
    getUnitForPage,
    ensureUnitForPage,
    prefetchUnitsAroundPage,
    toggleUnitComplete,
    regenerateUnit,
  }), [
    units,
    generatingByUnit,
    errorsByUnit,
    getUnitForPage,
    ensureUnitForPage,
    prefetchUnitsAroundPage,
    toggleUnitComplete,
    regenerateUnit,
  ])
}
