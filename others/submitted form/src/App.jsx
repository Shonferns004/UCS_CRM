import { Routes, Route, Navigate } from 'react-router-dom'
import SignatureConsent from './components/SignatureConsent'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignatureConsent />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
