import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext();

let toastCounter = 0;
let notifyFn = null;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function toast(message, type = 'info', duration = 4000) {
  if (notifyFn) {
    notifyFn({ id: ++toastCounter, message, type, duration });
  }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((t) => {
    setToasts(prev => [...prev, t]);
    if (t.duration && t.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, t.duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(x => x.id !== id));
  }, []);

  useEffect(() => {
    notifyFn = addToast;
    return () => { notifyFn = null; };
  }, [addToast]);

  const variantStyles = {
    success: { bg: '#16a34a', icon: '✓' },
    error: { bg: '#dc2626', icon: '✕' },
    info: { bg: '#2563eb', icon: 'ℹ' },
    warning: { bg: '#d97706', icon: '⚠' },
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none', maxWidth: '400px',
      }}>
        {toasts.map(t => {
          const v = variantStyles[t.type] || variantStyles.info;
          return (
            <div key={t.id} style={{
              pointerEvents: 'auto',
              padding: '12px 16px', borderRadius: '10px',
              background: v.bg, color: '#fff',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              animation: 'slideIn 0.3s ease',
              fontSize: '13px', lineHeight: 1.4,
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            }}>
              <span style={{ fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>{v.icon}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
              <button onClick={() => removeToast(t.id)} style={{
                background: 'transparent', border: 'none', color: '#fff',
                opacity: 0.7, cursor: 'pointer', padding: 0, fontSize: '16px',
                lineHeight: 1, flexShrink: 0,
              }}>×</button>
            </div>
          );
        })}
        <style>{`
          @keyframes slideIn {
            from { opacity: 0; transform: translateX(100%); }
            to { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </div>
    </ToastContext.Provider>
  );
}