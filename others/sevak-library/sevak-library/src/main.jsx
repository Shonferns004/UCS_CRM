import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

const ResumePayPage = lazy(() => import('./ResumePayPage.jsx'))

function RouteFallback() {
  return (
    <div style={{ padding: '40vh 0', textAlign: 'center', color: '#5f6368' }}>
      Loading...
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/pay/:ref" element={<ResumePayPage />} />
        </Routes>
      </Suspense>
    </HashRouter>
  </React.StrictMode>
)