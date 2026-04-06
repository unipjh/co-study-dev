import { create } from 'zustand'

const useChatStore = create((set, get) => ({
  messages: {}, // { [docId]: message[] }

  loadMessages: (docId, items) =>
    set((state) => ({ messages: { ...state.messages, [docId]: items } })),

  getMessages: (docId) => get().messages[docId] ?? [],
}))

export default useChatStore
