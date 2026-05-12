import { useEffect } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth'
import { auth, isFirebaseEmulatorEnabled } from '../lib/firebase'
import useAuthStore from '../store/authStore'

const devAuthEnabled = import.meta.env.DEV && import.meta.env.VITE_E2E_AUTH === 'true'
const hasDevEmailCredentials = Boolean(import.meta.env.VITE_E2E_AUTH_EMAIL && import.meta.env.VITE_E2E_AUTH_PASSWORD)
const devAuthAvailable = devAuthEnabled && (isFirebaseEmulatorEnabled || hasDevEmailCredentials)

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

  async function signInDev() {
    if (!devAuthEnabled) {
      throw new Error('개발용 로그인이 비활성화되어 있습니다.')
    }

    const email = import.meta.env.VITE_E2E_AUTH_EMAIL
    const password = import.meta.env.VITE_E2E_AUTH_PASSWORD

    if (email && password) {
      try {
        await signInWithEmailAndPassword(auth, email, password)
        return
      } catch (error) {
        if (!isFirebaseEmulatorEnabled) throw error

        const canCreateEmulatorUser =
          error?.code === 'auth/user-not-found' ||
          error?.code === 'auth/invalid-credential' ||
          error?.code === 'auth/invalid-login-credentials'

        if (!canCreateEmulatorUser) throw error
        await createUserWithEmailAndPassword(auth, email, password)
        return
      }
    }

    if (isFirebaseEmulatorEnabled) {
      await signInAnonymously(auth)
      return
    }

    throw new Error('VITE_E2E_AUTH_EMAIL과 VITE_E2E_AUTH_PASSWORD를 설정해 주세요.')
  }

  async function signOut() {
    await fbSignOut(auth)
  }

  return { user, loading, signIn, signInDev, signOut, devAuthEnabled: devAuthAvailable }
}
