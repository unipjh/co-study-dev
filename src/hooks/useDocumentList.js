import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import useAuthStore from '../store/authStore'

function docsCol(uid) {
  return collection(db, 'users', uid, 'documents')
}

/**
 * Firestore users/{uid}/documents 컬렉션 실시간 구독
 * document 구조: { docId, name, storagePath, uploadedAt, pageCount, folder? }
 */
export default function useDocumentList() {
  const uid = useAuthStore((s) => s.user?.uid)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!uid) return
    console.log('[useDocumentList] querying with uid:', uid)
    const q = query(docsCol(uid), orderBy('uploadedAt', 'desc'))
    const unsub = onSnapshot(q,
      (snapshot) => {
        setDocuments(snapshot.docs.map((d) => d.data()))
        setLoading(false)
      },
      (err) => {
        console.error('[useDocumentList] snapshot error:', err.code, err.message, 'uid:', uid)
      }
    )
    return unsub
  }, [uid])

  async function remove(docId, storagePath) {
    if (!uid) return
    if (storagePath) {
      try { await deleteObject(ref(storage, storagePath)) } catch (_) {}
    }
    await deleteDoc(doc(docsCol(uid), docId))
  }

  async function moveToFolder(docId, folder) {
    if (!uid) return
    await updateDoc(doc(docsCol(uid), docId), { folder: folder || null })
  }

  async function deleteFolder(folderName) {
    if (!uid) return
    const batch = writeBatch(db)
    documents
      .filter((d) => d.folder === folderName)
      .forEach((d) => batch.update(doc(docsCol(uid), d.docId), { folder: null }))
    await batch.commit()
  }

  return { documents, loading, remove, moveToFolder, deleteFolder }
}
