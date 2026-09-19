import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ToastProvider } from './components/ToastContext.jsx'
import useAuth from './hooks/useAuth.js'
import Toast from './components/Toast.jsx'
import MainLayout from './components/Layout/MainLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MetroLines from './pages/MetroLines.jsx'
import Stations from './pages/Stations.jsx'
import StationDetail from './pages/StationDetail.jsx'
import Machines from './pages/Machines.jsx'
import MachineDetail from './pages/MachineDetail.jsx'
import Refills from './pages/Refills.jsx'
import PadStock from './pages/PadStock.jsx'
import StockIssues from './pages/StockIssues.jsx'
import Maintenance from './pages/Maintenance.jsx'
import MonthlyData from './pages/MonthlyData.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import Users from './pages/Users.jsx'
import AuditLogs from './pages/AuditLogs.jsx'

function AdminRoute({ children }) {
  const { user } = useAuth()
  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/metro-lines" element={<MetroLines />} />
              <Route path="/stations" element={<Stations />} />
              <Route path="/stations/:id" element={<StationDetail />} />
              <Route path="/machines" element={<Machines />} />
              <Route path="/machines/:id" element={<MachineDetail />} />
              <Route path="/refills" element={<Refills />} />
              <Route path="/pad-stock" element={<PadStock />} />
              <Route path="/stock-issues" element={<StockIssues />} />
              <Route path="/maintenance" element={<Maintenance />} />
              <Route path="/monthly-data" element={<MonthlyData />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
              <Route path="/audit-logs" element={<AdminRoute><AuditLogs /></AdminRoute>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
          <Toast />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
