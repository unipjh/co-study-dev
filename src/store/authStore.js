import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user:    null,   // Firebase User | null
  loading: true,   // true until first onAuthStateChanged fires
  setUser:    (user) => set({ user, loading: false }),
}))

export default useAuthStore
