import { useState } from 'react'
import CoStudyLogo from '../components/Brand/CoStudyLogo'
import './LoginPage.css'

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962l3.007 2.332C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}

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

  function handleFeatureClick() {
    window.alert('아직 기능 소개 준비 x')
  }

  return (
    <main className="login-page">
      <CoStudyLogo className="login-wordmark" />

      <section className="login-hero" aria-label="Co-Study 로그인">
        <h1 className="login-heading">
          <span>홍보 멘트</span>
          <span>두 줄 정도</span>
        </h1>
        <p className="login-subtitle">PDF를 함께 공부하는 공간</p>
        <div className="login-actions">
          <button
            type="button"
            className="login-feature"
            onClick={handleFeatureClick}
          >
            기능 보기
          </button>
          <button
            type="button"
            className="login-google"
            onClick={() => runSignIn('google', onSignIn)}
            disabled={Boolean(pendingAction)}
          >
            <GoogleIcon />
            {pendingAction === 'google' ? '로그인 중...' : '구글로 로그인 하기'}
          </button>
        </div>
        {devAuthEnabled && (
          <button
            type="button"
            className="login-dev"
            onClick={() => runSignIn('dev', onDevSignIn)}
            disabled={Boolean(pendingAction)}
          >
            {pendingAction === 'dev' ? '테스트 로그인 중...' : 'Playwright 테스트 로그인'}
          </button>
        )}
        {error && <p className="login-error">{error}</p>}
      </section>
    </main>
  )
}
