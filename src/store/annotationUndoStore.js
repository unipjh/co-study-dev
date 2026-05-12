import { create } from 'zustand'

const useAnnotationUndoStore = create((set, get) => ({
  lastAction: null,
  busy: false,

  pushUndo: (action) => set({ lastAction: action, busy: false }),
  clearUndo: (id) =>
    set((state) => (!id || state.lastAction?.id === id ? { lastAction: null } : state)),

  undoLast: async () => {
    const action = get().lastAction
    if (!action || get().busy) return false

    set({ busy: true })
    try {
      await action.undo()
      set({ lastAction: null, busy: false })
      return true
    } catch (error) {
      console.error('[annotation undo] failed:', error)
      set({ busy: false })
      return false
    }
  },
}))

export default useAnnotationUndoStore
