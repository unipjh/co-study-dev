import { useEffect } from 'react'
import { collection, doc, onSnapshot, setDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useChatStore from '../store/chatStore'
import useAuthStore from '../store/authStore'
import { generateId } from '../lib/selectionUtils'

function msgsCol(uid, docId) {
  return collection(db, 'users', uid, 'chats', docId, 'messages')
}

/**
 * Chat 메시지 CRUD + Firestore 실시간 동기화
 *
 * message 구조:
 * {
 *   id, role: 'user' | 'assistant',
 *   content, contextText (선택한 annotation 텍스트),
 *   createdAt
 * }
 */
export default function useChat(docId) {
  const { loadMessages, getMessages } = useChatStore()
  const uid = useAuthStore((s) => s.user?.uid)

  useEffect(() => {
    if (!docId || !uid) return
    const q = query(msgsCol(uid, docId), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      loadMessages(docId, items)
    })
    return unsub
  }, [docId, uid])

  const messages = getMessages(docId)

  async function addMessage(role, content, contextText = null) {
    if (!docId || !uid) return null
    const msg = {
      id: generateId('msg'),
      role,
      content,
      contextText,
      createdAt: new Date().toISOString(),
    }
    await setDoc(doc(msgsCol(uid, docId), msg.id), msg)
    return msg
  }

  return { messages, addMessage }
}
