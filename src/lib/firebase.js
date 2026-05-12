import { initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db      = getFirestore(app)
export const storage = getStorage(app)
export const auth    = getAuth(app)

export const isFirebaseEmulatorEnabled =
  import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATOR === 'true'

if (isFirebaseEmulatorEnabled && !globalThis.__CO_STUDY_FIREBASE_EMULATORS_CONNECTED__) {
  connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099', {
    disableWarnings: true,
  })
  connectFirestoreEmulator(db, import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1', Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080))
  connectStorageEmulator(storage, import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1', Number(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199))

  globalThis.__CO_STUDY_FIREBASE_EMULATORS_CONNECTED__ = true
}
