import { Routes, Route } from 'react-router-dom'
import LibraryPage from './pages/LibraryPage'
import ViewerPage from './pages/ViewerPage'

export default function App() {
  return (
    <Routes>
      <Route path="/"          element={<LibraryPage />} />
      <Route path="/doc/:docId" element={<ViewerPage />} />
    </Routes>
  )
}
