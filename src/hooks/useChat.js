import { useEffect } from 'react'
import { collection, doc, onSnapshot, setDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useChatStore from '../store/chatStore'
import { generateId } from '../lib/selectionUtils'

function msgsCol(docId) {
  return collection(db, 'chats', docId, 'messages')
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

  useEffect(() => {
    if (!docId) return
    const q = query(msgsCol(docId), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      loadMessages(docId, items)
    })
    return unsub
  }, [docId])

  const messages = getMessages(docId)

  async function addMessage(role, content, contextText = null) {
    if (!docId) return null
    const msg = {
      id: generateId('msg'),
      role,
      content,
      contextText,
      createdAt: new Date().toISOString(),
    }
    await setDoc(doc(msgsCol(docId), msg.id), msg)
    return msg
  }

  return { messages, addMessage }
}
