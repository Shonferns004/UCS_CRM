import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './store'
import App from './App'
import './styles/base.css'
import './styles/intro.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Served from /voting, so every route starts with the base path. */}
    <BrowserRouter basename="/voting">
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
