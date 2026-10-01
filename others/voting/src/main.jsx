import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './store'
import App from './App'
import './styles/base.css'
import './styles/intro.css'
import './styles/login.css'

// The router has to sit on the same base the assets do, or every route resolves
// against the wrong prefix. Vite keeps the configured base in BASE_URL (always
// trailing-slashed), so /voting when the CRM serves this app and / when Vercel
// serves it from the root.
const base = import.meta.env.BASE_URL

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={base}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
