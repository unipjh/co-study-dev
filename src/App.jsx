import { Routes, Route, Navigate } from 'react-router-dom'
import useAuth from './hooks/useAuth'
import LibraryPage from './pages/LibraryPage'
import ViewerPage from './pages/ViewerPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  const { user, loading, signIn } = useAuth()

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#aaa', fontSize: 15 }}>로딩 중...</p>
      </div>
    )
  }

  if (!user) return <LoginPage onSignIn={signIn} />

  return (
    <Routes>
      <Route path="/"            element={<LibraryPage />} />
      <Route path="/doc/:docId"  element={<ViewerPage />} />
      <Route path="*"            element={<Navigate to="/" />} />
    </Routes>
  )
}
