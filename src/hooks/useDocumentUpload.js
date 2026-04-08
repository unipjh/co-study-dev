import { useState } from 'react'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { doc, setDoc } from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { storage, db } from '../lib/firebase'
import useAuthStore from '../store/authStore'

/**
 * PDF 파일을 Firebase Storage에 업로드하고
 * Firestore users/{uid}/documents/{docId}에 메타데이터 저장
 */
export default function useDocumentUpload() {
  const uid = useAuthStore((s) => s.user?.uid)
  const [progress,  setProgress]  = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)

  async function upload(file, pageCount = 0) {
    if (!file || !uid) return null
    setUploading(true)
    setError(null)
    setProgress(0)

    const docId       = nanoid()
    const storagePath = `pdfs/${docId}.pdf`
    const storageRef  = ref(storage, storagePath)

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, { contentType: 'application/pdf' })

      task.on(
        'state_changed',
        (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => {
          setError(err.message)
          setUploading(false)
          reject(err)
        },
        async () => {
          const downloadURL = await getDownloadURL(task.snapshot.ref)
          const meta = {
            docId,
            name:        file.name,
            storagePath,
            downloadURL,
            uploadedAt:  new Date().toISOString(),
            pageCount,
            folder:      null,
          }
          await setDoc(doc(db, 'users', uid, 'documents', docId), meta)
          setUploading(false)
          setProgress(100)
          resolve(meta)
        },
      )
    })
  }

  return { upload, progress, uploading, error }
}
