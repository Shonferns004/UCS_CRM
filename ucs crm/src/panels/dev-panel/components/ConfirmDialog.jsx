import { useEffect, useRef } from 'react';
import { useToast } from './Toast';

export function ConfirmDialog({ isOpen, onClose, title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger', loading = false, onConfirm, children }) {
  const { toast } = useToast();
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const prevActive = useRef(null);

  useEffect(() => {
    if (isOpen) {
      prevActive.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      setTimeout(() => dialogRef.current?.focus(), 0);
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Tab') {
          const focusable = dialogRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const variantColors = {
    danger: { primary: '#dc2626', primaryHover: '#b91c1c', bg: '#fef2f2' },
    primary: { primary: '#6366f1', primaryHover: '#4f46e5', bg: '#eef2ff' },
    warning: { primary: '#d97706', primaryHover: '#b45309', bg: '#fefce8' },
  };
  const c = variantColors[variant] || variantColors.danger;

  return (
    <div ref={overlayRef} className="confirm-dialog-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      animation: 'fadeIn 0.15s ease',
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div ref={dialogRef} tabIndex={-1} className="confirm-dialog" onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        width: '100%', maxWidth: children ? '520px' : '420px', maxHeight: '90vh', overflow: 'hidden',
        animation: 'slideUp 0.2s ease', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}>
        <style>{`
          @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
            background: c.bg, color: c.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {variant === 'danger' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            ) : variant === 'warning' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><circle cx="12" cy="16" r="1"/></svg>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>{title}</h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>

        {children && (
          <div style={{ padding: '0 24px 16px' }}>{children}</div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '12px 24px 20px', borderTop: '1px solid #e5e7eb',
        }}>
          <button onClick={onClose} disabled={loading} style={{
            padding: '10px 18px', fontSize: '13px', fontWeight: 600,
            borderRadius: '8px', border: '1px solid #d1d5db',
            background: '#fff', color: '#374151', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
            transition: 'all 120ms ease',
          }}>
            {cancelText}
          </button>
          <button onClick={async () => {
            try {
              await onConfirm();
            } catch (e) {
              toast(e.message || 'Action failed', 'error');
            }
          }} disabled={loading} style={{
            padding: '10px 18px', fontSize: '13px', fontWeight: 600,
            borderRadius: '8px', border: 'none',
            background: c.primary, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
            transition: 'all 120ms ease',
          }}>
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}