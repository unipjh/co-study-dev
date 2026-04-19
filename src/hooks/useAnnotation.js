import { useEffect } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAnnotationStore from '../store/annotationStore'
import useAuthStore from '../store/authStore'
import { generateId, isOverlapping } from '../lib/selectionUtils'

const EMPTY_ANNOTATIONS = []

function itemsCol(uid, docId) {
  return collection(db, 'users', uid, 'annotations', docId, 'items')
}

/**
 * Annotation CRUD + Firestore 실시간 동기화
 *
 * annotation 구조:
 * {
 *   id, docId, pageIndex, text, color, content,
 *   rects: [{ top, left, width, height }],
 *   spanIndex, startOffset, endOffset,
 *   rectGroups?: [{ pageIndex, rects, text }],
 *   type: 'manual' | 'ai' | 'region',
 *   createdAt
 * }
 */
export default function useAnnotation(docId) {
  const uid = useAuthStore((s) => s.user?.uid)
  const { loadAnnotations, updateAnnotation, removeAnnotation } =
    useAnnotationStore()

  // stable selector: docId가 같으면 동일 배열 레퍼런스 유지 (무한 루프 방지)
  const annotations = useAnnotationStore((s) => s.annotations[docId] ?? EMPTY_ANNOTATIONS)

  useEffect(() => {
    if (!docId || !uid) return
    const unsub = onSnapshot(itemsCol(uid, docId), (snapshot) => {
      const items = snapshot.docs.map((d) => d.data())
      loadAnnotations(docId, items)
    })
    return unsub
  }, [docId, uid])

  /**
   * annotation 추가
   * @param {SelectionInfo | SelectionInfo[]} selectionOrGroups  단일 또는 멀티 드래그 배열
   * @param {string} color
   * @param {string} content
   */
  async function add(selectionOrGroups, color, content = '') {
    if (!docId || !uid) return null

    const groups = Array.isArray(selectionOrGroups) ? selectionOrGroups : [selectionOrGroups]
    const first  = groups[0]

    const allText = groups.map((g) => g.text).join(' … ')

    const newItem = {
      id:          generateId('ann'),
      docId,
      pageIndex:   first.pageIndex,
      spanIndex:   first.spanIndex   ?? 0,
      startOffset: first.startOffset ?? 0,
      endOffset:   first.endOffset   ?? 0,
      rects:       first.rects ?? [],
      text:        allText,
      color,
      content,
      type:        first.isRegion ? 'region' : 'manual',
      createdAt:   new Date().toISOString(),
      ...(groups.length > 1 && {
        rectGroups: groups.map((g) => ({
          pageIndex: g.pageIndex,
          rects:     g.rects ?? [],
          text:      g.text,
        })),
      }),
    }

    const current     = useAnnotationStore.getState().annotations[docId] ?? []
    const overlapping = current.filter((a) => isOverlapping(a, newItem))
    await Promise.all(overlapping.map((a) => deleteDoc(doc(itemsCol(uid, docId), a.id))))

    await setDoc(doc(itemsCol(uid, docId), newItem.id), newItem)
    return newItem.id
  }

  async function update(id, patch) {
    if (!uid) return
    const current = (useAnnotationStore.getState().annotations[docId] ?? []).find((a) => a.id === id)
    if (!current) return
    const updated = { ...current, ...patch }
    await setDoc(doc(itemsCol(uid, docId), id), updated)
    updateAnnotation(docId, id, patch)
  }

  async function remove(id) {
    if (!uid) return
    await deleteDoc(doc(itemsCol(uid, docId), id))
    removeAnnotation(docId, id)
  }

  return { annotations, add, update, remove }
}
