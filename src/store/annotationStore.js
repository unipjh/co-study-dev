import { create } from 'zustand'

const useAnnotationStore = create((set, get) => ({
  annotations: {}, // { [docId]: annotation[] }

  loadAnnotations: (docId, items) =>
    set((state) => ({ annotations: { ...state.annotations, [docId]: items } })),

  updateAnnotation: (docId, id, patch) =>
    set((state) => ({
      annotations: {
        ...state.annotations,
        [docId]: (state.annotations[docId] ?? []).map((a) =>
          a.id === id ? { ...a, ...patch } : a
        ),
      },
    })),

  removeAnnotation: (docId, id) =>
    set((state) => ({
      annotations: {
        ...state.annotations,
        [docId]: (state.annotations[docId] ?? []).filter((a) => a.id !== id),
      },
    })),

  getAnnotations: (docId) => get().annotations[docId] ?? [],
}))

export default useAnnotationStore
