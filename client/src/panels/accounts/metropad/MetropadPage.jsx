import React from 'react';
import Dashboard from './pages/Dashboard.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './components/ToastContext.jsx';

import './styles/global.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/dashboard.css';
import './styles/utilities.css';

export default function MetropadPage() {
  return (
    <ToastProvider>
      <AuthProvider>
        <div className="mp-root">
          <Dashboard />
        </div>
      </AuthProvider>
    </ToastProvider>
  );
}
