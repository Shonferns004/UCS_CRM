import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Outermost, so a crash anywhere below still renders a recoverable page
        rather than a blank one. */}
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)
