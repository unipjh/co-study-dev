import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAuthStore from '../store/authStore'
import { stableHash } from '../lib/studyIds'

function sessionsCol(uid, docId) {
  return collection(db, 'users', uid, 'documents', docId, 'quizSessions')
}

export default function useQuizSessions(docId) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    setSessions([])
  }, [docId, uid])

  useEffect(() => {
    if (!uid || !docId) return
    const q = query(sessionsCol(uid, docId), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      setSessions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
    return unsub
  }, [uid, docId])

  const saveSession = useCallback(async (session) => {
    if (!uid || !docId) return null
    const now = new Date().toISOString()
    const id = session.id ?? `quiz_${Date.now()}_${stableHash(session.scopeLabel || session.scope)}`
    const payload = {
      ...session,
      id,
      createdAt: session.createdAt ?? now,
      updatedAt: now,
    }
    await setDoc(doc(sessionsCol(uid, docId), id), payload)
    setSessions((prev) => {
      const rest = prev.filter((item) => item.id !== id)
      return [payload, ...rest].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    })
    return payload
  }, [uid, docId])

  return useMemo(() => ({ sessions, saveSession }), [sessions, saveSession])
}
