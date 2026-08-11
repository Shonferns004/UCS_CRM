import { useEffect, useRef } from 'react';

export default function RightPanel({ open, onClose, title, subtitle, width = 640, topOffset = 72, accent = 'var(--sage)', children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={panelRef} style={{ position: 'fixed', top: topOffset, right: 0, width, maxWidth: '100vw', height: `calc(100vh - ${topOffset}px)`, background: 'var(--card-bg)', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, boxShadow: '-14px 0 40px rgba(15,23,42,.18)', display: 'flex', flexDirection: 'column', zIndex: 1000, overflow: 'hidden', animation: 'rp-slide .28s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 14px 20px', borderBottom: '1px solid var(--line)', background: '#fff', flexShrink: 0 }}>
        <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 4, borderRadius: 4, background: accent }} />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h3>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
        </div>
        <button
          onClick={onClose}
          title="Close"
          style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0, transition: 'all .15s' }}
          onMouseOver={e => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#6b7280'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>{children}</div>
      <style>{`@keyframes rp-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </div>
  );
}
