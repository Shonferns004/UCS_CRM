import React from 'react';
import useAuth from './hooks/useAuth.js';
import Dashboard from './pages/Dashboard.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './components/ToastContext.jsx';

import './styles/global.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/dashboard.css';
import './styles/utilities.css';

function MetropadGate() {
  const { user, tokenReady } = useAuth();

  if (!tokenReady) {
    return (
      <div className="mp-root">
        <div className="mp-page-unknown">
          <LoadingSpinner message="Checking Metropad access..." />
        </div>
      </div>
    );
  }

  // The Metropad page rides on the accounts-panel session. If no metropad
  // user maps to the signed-in accounts email, show a notice instead of a
  // separate Metropad login (there is intentionally no second login screen).
  if (!user) {
    return (
      <div className="mp-root">
        <div className="mp-page-unknown">
          <h2 style={{ color: 'var(--color-text)', fontSize: 18, marginBottom: 8 }}>
            No Metropad access
          </h2>
          <p style={{ color: 'var(--color-text-light)', maxWidth: 440 }}>
            The account you are signed in with is not linked to a Metropad user.
            Ask a Metropad administrator to add this account, or sign in with a
            Metropad-enabled account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-root">
      <Dashboard />
    </div>
  );
}

export default function MetropadPage() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MetropadGate />
      </AuthProvider>
    </ToastProvider>
  );
}
