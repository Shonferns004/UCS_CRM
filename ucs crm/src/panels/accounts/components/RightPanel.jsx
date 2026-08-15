import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const DefaultIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
);

export default function RightPanel({ open, onClose, title, subtitle, width = 640, topOffset = 72, accent = 'var(--sage)', icon, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      // Ignore clicks inside portaled picker popovers (date/time/month pickers
      // render into #root, outside this panel) so picking a value never closes
      // the panel.
      if (e.target && e.target.closest && e.target.closest('[data-mdp],[data-mtp],[data-mmi]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const tint = `color-mix(in srgb, ${accent} 8%, #ffffff)`;
  const chipBg = `color-mix(in srgb, ${accent} 14%, #ffffff)`;

  return createPortal(
    <div ref={panelRef} style={{
      // This component is portaled to body, outside .panel-accounts. Keep the
      // Accounts theme available to the panel and all of its detail content.
      '--sage': '#5B6B4E',
      '--sage-light': '#7A8F6A',
      '--ink': '#1a1a2e',
      '--ink-soft': '#6b7280',
      '--line': '#e5e7eb',
      '--danger': '#d9534f',
      '--warning': '#e67e22',
      '--success': '#16a34a',
      '--bg': '#f5f6fa',
      '--card-bg': '#ffffff',
      '--radius': '12px',
      '--radius-sm': '8px',
      '--shadow': '0 1px 3px rgba(0,0,0,0.06)',
      '--shadow-md': '0 4px 12px rgba(0,0,0,0.08)',
      position: 'fixed', top: topOffset, right: 0, width, maxWidth: '100vw', height: `calc(100vh - ${topOffset}px)`, background: 'var(--card-bg)', borderTopLeftRadius: 18, borderBottomLeftRadius: 18, borderLeft: '1px solid var(--line)', boxShadow: '-10px 0 36px rgba(15,23,42,.15)', display: 'flex', flexDirection: 'column', zIndex: 1001, overflow: 'hidden', animation: 'rp-slide .3s cubic-bezier(.22,1,.36,1) both'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 16px 18px', borderBottom: '1px solid var(--line)', background: `linear-gradient(90deg, ${tint}, #ffffff 72%)`, flexShrink: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: chipBg, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 1px 3px ${tint}` }}>{icon || <DefaultIcon />}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h3>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
        </div>
        <button
          onClick={onClose}
          title="Close"
          style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0, transition: 'all .15s', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}
          onMouseOver={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#111827'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#6b7280'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, background: 'var(--bg)' }}>{children}</div>
      <style>{`@keyframes rp-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </div>,
    document.body
  );
}
