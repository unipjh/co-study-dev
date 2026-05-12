import { useState } from 'react'

export default function LoginPage({ onSignIn, onDevSignIn, devAuthEnabled }) {
  const [pendingAction, setPendingAction] = useState(null)
  const [error, setError] = useState('')

  async function runSignIn(action, callback) {
    setError('')
    setPendingAction(action)

    try {
      await callback()
    } catch (err) {
      setError(err?.message || '로그인에 실패했습니다.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div style={styles.root}>
      <main style={styles.panel}>
        <div style={styles.logo}>co-study</div>
        <p style={styles.desc}>PDF를 읽고, 메모하고, 함께 공부하는 공간</p>

        <button
          style={styles.googleBtn}
          onClick={() => runSignIn('google', onSignIn)}
          disabled={Boolean(pendingAction)}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
            <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
          </svg>
          {pendingAction === 'google' ? '로그인 중...' : 'Google로 시작하기'}
        </button>

        {devAuthEnabled && (
          <button
            style={styles.devBtn}
            onClick={() => runSignIn('dev', onDevSignIn)}
            disabled={Boolean(pendingAction)}
          >
            {pendingAction === 'dev' ? '테스트 로그인 중...' : 'Playwright 테스트 로그인'}
          </button>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </main>
    </div>
  )
}

const baseButton = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  minHeight: 42,
  padding: '10px 18px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
    padding: 24,
  },
  panel: {
    width: 'min(100%, 360px)',
    background: '#fff',
    borderRadius: 8,
    padding: '42px 36px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    fontSize: 28,
    fontWeight: 800,
    color: '#1a1a1a',
  },
  desc: {
    fontSize: 14,
    lineHeight: 1.5,
    color: '#666',
    textAlign: 'center',
    margin: '0 0 8px',
  },
  googleBtn: {
    ...baseButton,
    border: '1px solid #e0e0e0',
    background: '#fff',
    color: '#1a1a1a',
  },
  devBtn: {
    ...baseButton,
    border: '1px solid #2f6fed',
    background: '#2f6fed',
    color: '#fff',
  },
  error: {
    width: '100%',
    margin: '2px 0 0',
    color: '#c62828',
    fontSize: 13,
    lineHeight: 1.45,
    textAlign: 'center',
  },
}
