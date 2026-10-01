import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ToastContainer from './components/Toast'
import './styles/base.css'
import './styles/screens.css'

// No router: this booth has exactly one URL. The event is identified by the
// server's "is anything live" answer, not by a path, so a rater who bookmarks
// the link during a gap still lands on the right screen later.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ToastContainer />
  </StrictMode>,
)