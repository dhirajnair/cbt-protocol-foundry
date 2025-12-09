import { Routes, Route } from 'react-router-dom'
import { Toaster } from './components/ui/toaster'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import SessionDetail from './pages/SessionDetail'
import ReviewPending from './pages/ReviewPending'

function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/review/:threadId" element={<ReviewPending />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

export default App

