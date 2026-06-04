import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'

const SESSION_KEY = 'costudy:interactionSessionId'
export const INTERACTION_LOG_COLLECTION = 'interactionLogs'

export function interactionLogsCollection(uid = auth.currentUser?.uid) {
  if (!uid) return null
  return collection(db, 'users', uid, INTERACTION_LOG_COLLECTION)
}

export function isInteractionLoggingEnabled() {
  return import.meta.env.VITE_INTERACTION_LOGS_ENABLED !== 'false'
}

export function getLogDashboardPassword() {
  return import.meta.env.VITE_LOG_DASHBOARD_PASSWORD || (import.meta.env.DEV ? 'costudy-log' : '')
}

function getSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY)
    if (existing) return existing

    const next = window.crypto?.randomUUID?.() ?? `session_${Date.now()}_${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return `session_${Date.now()}`
  }
}

function cleanValue(value, depth = 0) {
  if (value == null) return null
  if (typeof value === 'string') return value.slice(0, 2000)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`
    return value.slice(0, 20).map((item) => cleanValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '[object]'
    return Object.entries(value).reduce((acc, [key, entry]) => {
      if (entry === undefined || typeof entry === 'function') return acc
      acc[key] = cleanValue(entry, depth + 1)
      return acc
    }, {})
  }
  return String(value)
}

function cleanMetadata(metadata = {}) {
  return cleanValue(metadata) ?? {}
}

export function logInteraction(eventType, metadata = {}) {
  if (!isInteractionLoggingEnabled()) return Promise.resolve(null)
  if (!eventType || typeof eventType !== 'string') return Promise.resolve(null)

  const currentUser = auth.currentUser
  const logsRef = interactionLogsCollection(currentUser?.uid)
  if (!logsRef) return Promise.resolve(null)

  const payload = {
    eventType,
    timestamp: serverTimestamp(),
    clientTimestamp: new Date().toISOString(),
    userId: currentUser?.uid ?? null,
    sessionId: getSessionId(),
    route: `${window.location.pathname}${window.location.search}`,
    docId: metadata.docId ?? null,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    metadata: cleanMetadata(metadata),
  }

  return addDoc(logsRef, payload).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn('[interactionLogs] failed to write interaction log', { eventType, error })
    }
    return null
  })
}
