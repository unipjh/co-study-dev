import { useState } from 'react'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { doc, setDoc } from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { storage, db } from '../lib/firebase'
import useAuthStore from '../store/authStore'
import { logInteraction } from '../lib/interactionLogs'

const MAX_PDF_UPLOAD_BYTES = 100 * 1024 * 1024

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '-'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`
}

function getUploadErrorMessage(error) {
  const code = error?.code ?? ''

  if (code === 'storage/unauthorized') return 'PDF 업로드 권한이 없습니다. 다시 로그인한 뒤 시도해 주세요.'
  if (code === 'storage/quota-exceeded') return 'Firebase Storage 용량이 부족해 업로드할 수 없습니다.'
  if (code === 'storage/retry-limit-exceeded') return '네트워크가 불안정해 업로드가 중단되었습니다. 잠시 후 다시 시도해 주세요.'
  if (code === 'storage/canceled') return 'PDF 업로드가 취소되었습니다.'
  if (code === 'permission-denied') return '문서 정보를 저장할 권한이 없습니다. Firestore Rules를 확인해 주세요.'
  if (code === 'unavailable') return '서버 연결이 불안정합니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'

  return error?.message || 'PDF 업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}

function isPdfFile(file) {
  const hasPdfName = file.name.toLowerCase().endsWith('.pdf')
  const hasPdfType = file.type === 'application/pdf'
  const hasUnknownType = !file.type
  return hasPdfName && (hasPdfType || hasUnknownType)
}

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
    if (!file) return null
    if (!uid) {
      setError('로그인 후 PDF를 업로드할 수 있습니다.')
      return null
    }
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      setError(`PDF는 최대 ${formatFileSize(MAX_PDF_UPLOAD_BYTES)}까지 업로드할 수 있습니다. 현재 파일은 ${formatFileSize(file.size)}입니다.`)
      return null
    }
    if (!isPdfFile(file)) {
      setError('PDF 파일만 업로드할 수 있습니다.')
      return null
    }

    setUploading(true)
    setError(null)
    setProgress(0)

    const docId       = nanoid()
    const storagePath = `pdfs/${docId}.pdf`
    const storageRef  = ref(storage, storagePath)

    return new Promise((resolve) => {
      const task = uploadBytesResumable(storageRef, file, { contentType: 'application/pdf' })

      task.on(
        'state_changed',
        (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => {
          setError(getUploadErrorMessage(err))
          setUploading(false)
          setProgress(0)
          resolve(null)
        },
        async () => {
          try {
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
            logInteraction('document_upload', {
              docId,
              name: file.name,
              size: file.size,
              type: file.type,
              source: 'library',
            })
            setUploading(false)
            setProgress(100)
            resolve(meta)
          } catch (err) {
            try {
              await deleteObject(task.snapshot.ref)
            } catch (_) {}
            setError(getUploadErrorMessage(err))
            setUploading(false)
            setProgress(0)
            resolve(null)
          }
        },
      )
    })
  }

  return { upload, progress, uploading, error }
}
