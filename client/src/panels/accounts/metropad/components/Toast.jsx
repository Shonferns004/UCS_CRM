import React, { useContext } from 'react';
import { ToastContext } from './ToastContext';

const iconMap = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
};

function Toast() {
  const { toasts, removeToast } = useContext(ToastContext);

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <span className="toast-icon">{iconMap[toast.type] || 'ℹ️'}</span>
          <div className="toast-content">
            <span className="toast-message">{toast.message}</span>
          </div>
          <button
            className="toast-close-btn"
            onClick={() => removeToast(toast.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toast;
