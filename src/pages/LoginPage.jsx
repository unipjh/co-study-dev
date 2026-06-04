import { useEffect, useMemo, useRef, useState } from 'react'
import { getDownloadURL, ref as storageRef } from 'firebase/storage'
import CoStudyLogo from '../components/Brand/CoStudyLogo'
import { storage } from '../lib/firebase'
import './LoginPage.css'

const FEATURE_VIDEOS = [
  {
    id: 'chat',
    fileName: 'Chat.mp4',
    title: 'Chat',
    fallbackUrl: new URL('../../introduce_video/Chat.mp4', import.meta.url).href,
  },
  {
    id: 'memo',
    fileName: '메모.mp4',
    title: '메모',
    fallbackUrl: new URL('../../introduce_video/메모.mp4', import.meta.url).href,
  },
  {
    id: 'memo-popup',
    fileName: '메모&팝업질문.mp4',
    title: '메모&팝업질문',
    fallbackUrl: new URL('../../introduce_video/메모&팝업질문.mp4', import.meta.url).href,
  },
  {
    id: 'ai-explain',
    fileName: 'AI즉시설명.mp4',
    title: 'AI즉시설명',
    fallbackUrl: new URL('../../introduce_video/AI즉시설명.mp4', import.meta.url).href,
  },
  {
    id: 'mindmap',
    fileName: '마인드맵.mp4',
    title: '마인드맵',
    fallbackUrl: new URL('../../introduce_video/마인드맵.mp4', import.meta.url).href,
  },
  {
    id: 'quiz',
    fileName: '퀴즈.mp4',
    title: '퀴즈',
    fallbackUrl: new URL('../../introduce_video/퀴즈.mp4', import.meta.url).href,
  },
]

const SHOULD_USE_STORAGE_VIDEOS =
  import.meta.env.PROD || import.meta.env.VITE_INTRODUCE_VIDEO_SOURCE === 'storage'

function useFeatureVideoUrl(video) {
  const [url, setUrl] = useState(video.fallbackUrl)

  useEffect(() => {
    let cancelled = false
    setUrl(video.fallbackUrl)
    if (!SHOULD_USE_STORAGE_VIDEOS) return undefined

    async function loadStorageUrl() {
      try {
        const remoteUrl = await getDownloadURL(storageRef(storage, `introduce_video/${video.fileName}`))
        if (!cancelled) setUrl(remoteUrl)
      } catch (err) {
        if (!cancelled) setUrl(video.fallbackUrl)
      }
    }

    loadStorageUrl()
    return () => {
      cancelled = true
    }
  }, [video])

  return url
}

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
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState(FEATURE_VIDEOS[0].id)
  const [playNonce, setPlayNonce] = useState(0)
  const videoRef = useRef(null)
  const activeVideo = useMemo(
    () => FEATURE_VIDEOS.find((video) => video.id === activeVideoId) ?? FEATURE_VIDEOS[0],
    [activeVideoId]
  )
  const activeVideoUrl = useFeatureVideoUrl(activeVideo)

  useEffect(() => {
    videoRef.current?.play?.().catch(() => {})
  }, [activeVideoId, activeVideoUrl, playNonce])

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
    setTutorialOpen(true)
    setPlayNonce((count) => count + 1)
  }

  function handleVideoSelect(videoId) {
    setActiveVideoId(videoId)
    setPlayNonce((count) => count + 1)
  }

  if (tutorialOpen) {
    return (
      <main className="login-page login-page-tutorial">
        <CoStudyLogo className="login-wordmark login-wordmark-tutorial" />

        <section className="tutorial-view" aria-label="Co-Study 기능 보기">
          <header className="tutorial-header">
            <button type="button" className="tutorial-back" onClick={() => setTutorialOpen(false)}>
              돌아가기
            </button>
            <h1 className="tutorial-title">기능 보기</h1>
            <button
              type="button"
              className="tutorial-google"
              onClick={() => runSignIn('google', onSignIn)}
              disabled={Boolean(pendingAction)}
            >
              <GoogleIcon />
              {pendingAction === 'google' ? '로그인 중...' : '구글로 로그인'}
            </button>
          </header>

          <div className="tutorial-layout">
            <nav className="tutorial-tabs" aria-label="기능 영상 목록">
              {FEATURE_VIDEOS.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  className={`tutorial-tab${video.id === activeVideo.id ? ' is-active' : ''}`}
                  onClick={() => handleVideoSelect(video.id)}
                  aria-pressed={video.id === activeVideo.id}
                >
                  {video.title}
                </button>
              ))}
            </nav>

            <div className="tutorial-player-wrap">
              <div className="tutorial-player-heading">{activeVideo.title}</div>
              <div className="tutorial-player">
                <video
                  key={`${activeVideo.id}-${activeVideoUrl}-${playNonce}`}
                  ref={videoRef}
                  className="tutorial-video"
                  src={activeVideoUrl}
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
            </div>
          </div>

          {devAuthEnabled && (
            <button
              type="button"
              className="login-dev tutorial-dev"
              onClick={() => runSignIn('dev', onDevSignIn)}
              disabled={Boolean(pendingAction)}
            >
              {pendingAction === 'dev' ? '테스트 로그인 중...' : 'Playwright 테스트 로그인'}
            </button>
          )}
          {error && <p className="login-error tutorial-error">{error}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <CoStudyLogo className="login-wordmark" />

      <section className="login-hero" aria-label="Co-Study 로그인">
        <h1 className="login-heading">
          <span>AI 기반 맞춤형 학습 스타일 최적화,</span>
          <span>지금 바로 시작해 보세요.</span>
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
