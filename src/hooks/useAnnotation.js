import { useEffect } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAnnotationStore from '../store/annotationStore'
import { generateId, isOverlapping } from '../lib/selectionUtils'

function itemsCol(docId) {
  return collection(db, 'annotations', docId, 'items')
}

/**
 * Annotation CRUD + Firestore 실시간 동기화
 * Annotation = 하이라이트 + 메모 통합 객체
 *
 * annotation 구조:
 * {
 *   id, docId, pageIndex, text, color, content,
 *   rects: [{ top, left, width, height }],  // 비율, 텍스트 줄 단위
 *   spanIndex, startOffset, endOffset,
 *   type: 'manual' | 'ai',
 *   createdAt
 * }
 */
export default function useAnnotation(docId) {
  const { loadAnnotations, updateAnnotation, removeAnnotation, getAnnotations } =
    useAnnotationStore()

  useEffect(() => {
    if (!docId) return
    const unsub = onSnapshot(itemsCol(docId), (snapshot) => {
      const items = snapshot.docs.map((d) => d.data())
      loadAnnotations(docId, items)
    })
    return unsub
  }, [docId])

  const annotations = getAnnotations(docId)

  async function add(selectionInfo, color, content = '') {
    if (!docId) return null

    const newItem = {
      id: generateId('ann'),
      docId,
      pageIndex: selectionInfo.pageIndex,
      spanIndex: selectionInfo.spanIndex,
      startOffset: selectionInfo.startOffset,
      endOffset: selectionInfo.endOffset,
      text: selectionInfo.text,
      color,
      content,
      rects: selectionInfo.rects ?? [],
      type: 'manual',
      createdAt: new Date().toISOString(),
    }

    // 겹치는 annotation 제거
    const current = getAnnotations(docId)
    const overlapping = current.filter((a) => isOverlapping(a, newItem))
    await Promise.all(overlapping.map((a) => deleteDoc(doc(itemsCol(docId), a.id))))

    await setDoc(doc(itemsCol(docId), newItem.id), newItem)
    return newItem.id
  }

  async function update(id, patch) {
    const current = getAnnotations(docId).find((a) => a.id === id)
    if (!current) return
    const updated = { ...current, ...patch }
    await setDoc(doc(itemsCol(docId), id), updated)
    updateAnnotation(docId, id, patch)
  }

  async function remove(id) {
    await deleteDoc(doc(itemsCol(docId), id))
    removeAnnotation(docId, id)
  }

  return { annotations, add, update, remove }
}
