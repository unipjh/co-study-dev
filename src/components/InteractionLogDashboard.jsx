import { useEffect, useMemo, useState } from 'react'
import { getDocs, limit, orderBy, query } from 'firebase/firestore'
import { auth } from '../lib/firebase'
import {
  getLogDashboardPassword,
  interactionLogsCollection,
  isInteractionLoggingEnabled,
  logInteraction,
} from '../lib/interactionLogs'
import './InteractionLogDashboard.css'

const AUTH_KEY = 'costudy:logDashboardAuthorized'
const LOG_LIMIT = 300

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value) {
  const date = toDate(value)
  if (!date) return '-'
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatMetadata(metadata = {}) {
  const entries = Object.entries(metadata)
    .filter(([, value]) => value != null && value !== '')
    .slice(0, 5)

  if (entries.length === 0) return '-'
  return entries
    .map(([key, value]) => {
      const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `${key}: ${formatted.slice(0, 80)}`
    })
    .join(' · ')
}

function shortId(value) {
  if (!value) return '-'
  return String(value).slice(0, 8)
}

export default function InteractionLogDashboard({ open, onClose }) {
  const requiredPassword = getLogDashboardPassword()
  const [authorized, setAuthorized] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const eventTypes = useMemo(() => {
    return [...new Set(logs.map((item) => item.eventType).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [logs])

  const filteredLogs = useMemo(() => {
    if (typeFilter === 'all') return logs
    return logs.filter((item) => item.eventType === typeFilter)
  }, [logs, typeFilter])

  const uniqueSessions = useMemo(() => {
    return new Set(logs.map((item) => item.sessionId).filter(Boolean)).size
  }, [logs])

  async function loadLogs() {
    setLoading(true)
    setLoadError('')
    try {
      const logsRef = interactionLogsCollection(auth.currentUser?.uid)
      if (!logsRef) {
        setLogs([])
        setLoadError('로그인 사용자만 로그를 조회할 수 있습니다.')
        return
      }
      const q = query(
        logsRef,
        orderBy('timestamp', 'desc'),
        limit(LOG_LIMIT),
      )
      const snapshot = await getDocs(q)
      setLogs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
    } catch (error) {
      setLoadError(error?.message ?? '로그를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !authorized) return
    loadLogs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authorized])

  if (!open) return null

  function handlePasswordSubmit(event) {
    event.preventDefault()
    setAuthError('')

    if (!requiredPassword) {
      setAuthError('VITE_LOG_DASHBOARD_PASSWORD를 설정해야 로그를 볼 수 있습니다.')
      return
    }

    if (password !== requiredPassword) {
      setAuthError('비밀번호가 맞지 않습니다.')
      logInteraction('log_dashboard_auth_failed', { source: 'library' })
      return
    }

    sessionStorage.setItem(AUTH_KEY, 'true')
    setAuthorized(true)
    setPassword('')
    logInteraction('log_dashboard_auth_success', { source: 'library' })
  }

  return (
    <div className="log-dashboard-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="log-dashboard-modal"
        role="dialog"
        aria-modal="true"
        aria-label="사용자 로그 대시보드"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="log-dashboard-header">
          <div>
            <h2>사용자 로그</h2>
            <p>최근 {LOG_LIMIT}개 이벤트</p>
          </div>
          <button type="button" className="log-dashboard-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        {!isInteractionLoggingEnabled() && (
          <div className="log-dashboard-warning">
            VITE_INTERACTION_LOGS_ENABLED=false 상태입니다. 새 클릭 로그는 저장되지 않습니다.
          </div>
        )}

        {!authorized ? (
          <form className="log-dashboard-auth" onSubmit={handlePasswordSubmit}>
            <label htmlFor="log-dashboard-password">비밀번호</label>
            <input
              id="log-dashboard-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
            {authError && <p>{authError}</p>}
            <button type="submit">열기</button>
          </form>
        ) : (
          <>
            <div className="log-dashboard-summary" aria-label="로그 요약">
              <div>
                <span>수집 로그</span>
                <strong>{logs.length}</strong>
              </div>
              <div>
                <span>필터 결과</span>
                <strong>{filteredLogs.length}</strong>
              </div>
              <div>
                <span>세션</span>
                <strong>{uniqueSessions}</strong>
              </div>
            </div>

            <div className="log-dashboard-controls">
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="이벤트 타입 필터">
                <option value="all">전체 이벤트</option>
                {eventTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <button type="button" onClick={loadLogs} disabled={loading}>
                {loading ? '새로고침 중' : '새로고침'}
              </button>
            </div>

            {loadError && <div className="log-dashboard-error">{loadError}</div>}

            <div className="log-dashboard-table-wrap">
              <table className="log-dashboard-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>이벤트</th>
                    <th>사용자</th>
                    <th>세션</th>
                    <th>경로</th>
                    <th>상세</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="6" className="log-dashboard-state">로그를 불러오는 중입니다.</td>
                    </tr>
                  )}
                  {!loading && filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan="6" className="log-dashboard-state">표시할 로그가 없습니다.</td>
                    </tr>
                  )}
                  {!loading && filteredLogs.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.timestamp ?? item.clientTimestamp)}</td>
                      <td><code>{item.eventType}</code></td>
                      <td title={item.userId || ''}>{shortId(item.userId)}</td>
                      <td title={item.sessionId || ''}>{shortId(item.sessionId)}</td>
                      <td title={item.route || ''}>{item.route || '-'}</td>
                      <td title={formatMetadata(item.metadata)}>{formatMetadata(item.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
