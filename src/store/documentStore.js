import { create } from 'zustand'

const useDocumentStore = create((set) => ({
  pdfBlob: null,        // Storage에서 받은 Blob (react-pdf에 직접 전달)
  pdfName: null,        // 표시용 파일명
  numPages: 0,
  currentPage: 1,
  zoomLevel: 1.0,
  viewMode: 'page', // 'page' | 'scroll'
  selectedText: '',
  selectionRect: null,

  // Storage 문서 세팅 (ViewerPage에서 호출)
  setStorageDoc: ({ blob, name }) =>
    set({ pdfBlob: blob, pdfName: name, currentPage: 1, numPages: 0 }),
  setNumPages: (n) => set({ numPages: n }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setZoomLevel: (level) => set({ zoomLevel: Math.min(2.0, Math.max(0.5, level)) }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelection: (text, rect) => set({ selectedText: text, selectionRect: rect }),
  clearSelection: () => set({ selectedText: '', selectionRect: null }),
}))

export default useDocumentStore
