import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, deleteDoc, doc } from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from '../lib/firebase'

/**
 * Firestore documents 컬렉션 실시간 구독
 * document 구조: { docId, name, storagePath, uploadedAt, pageCount }
 */
export default function useDocumentList() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('uploadedAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      setDocuments(snapshot.docs.map((d) => d.data()))
      setLoading(false)
    })
    return unsub
  }, [])

  async function remove(docId, storagePath) {
    // Storage 파일 삭제
    if (storagePath) {
      try {
        await deleteObject(ref(storage, storagePath))
      } catch (_) {
        // 이미 없으면 무시
      }
    }
    // Firestore documents 문서 삭제 (annotations/chats는 유지 — 필요 시 별도 처리)
    await deleteDoc(doc(db, 'documents', docId))
  }

  return { documents, loading, remove }
}
