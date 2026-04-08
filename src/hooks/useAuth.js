import { useEffect } from 'react'
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import useAuthStore from '../store/authStore'

export default function useAuth() {
  const { user, loading, setUser } = useAuthStore()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return unsub
  }, [])

  async function signIn() {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  async function signOut() {
    await fbSignOut(auth)
  }

  return { user, loading, signIn, signOut }
}
