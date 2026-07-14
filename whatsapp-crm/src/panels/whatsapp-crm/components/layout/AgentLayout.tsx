import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export function AgentOnlyInbox() {
  const { user } = useAuthStore();
  const location = useLocation();
  if (user?.role === 'agent' && location.pathname !== '/inbox' && !location.pathname.startsWith('/inbox/')) {
    return <Navigate to="/inbox" replace />;
  }
  return <Outlet />;
}
