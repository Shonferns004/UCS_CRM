import { Routes, Route, Navigate } from 'react-router-dom'
import Onboarding from './components/Onboarding'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Onboarding />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
