import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SettingsDrawer({ open, onClose, themes, themeName, onThemeChange, selector, navItems, views }) {
  const [view, setView] = useState(null);
  const navigate = useNavigate();

  if (!open) return null;

  const activeView = views && view ? views.find(v => v.key === view) : null;
  const isSubView = view === 'themes' || !!activeView;
  const drawerWidth = activeView ? (activeView.width || 420) : 280;

  return (
    <>
      <div className="modal-overlay" onClick={() => { onClose(); setView(null); }} style={{ zIndex: 200 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: drawerWidth,
        background: 'var(--card-bg)', zIndex: 201,
        boxShadow: '-4px 0 24px rgba(0,0,0,.1)',
        display: 'flex', flexDirection: 'column',
        transition: 'width .2s ease',
        animation: 'slideInRight .2s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          {isSubView && (
            <button className="btn btn-sm btn-icon" onClick={() => setView(null)} style={{ padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
          )}
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {view === 'themes' ? 'Themes' : activeView ? activeView.label : 'Settings'}
          </h3>
          <button className="btn btn-sm btn-icon" onClick={() => { onClose(); setView(null); }} style={{ padding: 4, marginLeft: 'auto' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isSubView ? '12px' : '8px 0' }}>
          {view === 'themes' ? (
            <div style={{ padding: '0 12px' }}>
              {Object.entries(themes || {}).map(([key, theme]) => (
                <div key={key}
                  onClick={() => onThemeChange?.(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', marginBottom: 4,
                    background: key === themeName ? 'var(--sage-soft)' : 'transparent',
                    border: key === themeName ? '1px solid var(--sage)' : '1px solid transparent',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = key === themeName ? 'var(--sage-soft)' : 'var(--bg)'}
                  onMouseOut={e => e.currentTarget.style.background = key === themeName ? 'var(--sage-soft)' : 'transparent'}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: theme.sage, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{theme.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 1 }}>{theme.sand} / {theme.ink}</div>
                  </div>
                  {key === themeName && <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--sage)' }}>✓</span>}
                </div>
              ))}
            </div>
          ) : activeView ? (
            <div>{activeView.content}</div>
          ) : (
            <>
              {themes && (
                <div onClick={() => setView('themes')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span>Themes</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>→</span>
                </div>
              )}
              {views && views.map((v) => (
                <div key={v.key} onClick={() => setView(v.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  {v.icon}
                  <span>{v.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>→</span>
                </div>
              ))}
              {navItems && navItems.map((item, i) => (
                <div key={i} onClick={() => { navigate(item.path); onClose(); setView(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  {item.icon}
                  <span>{item.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>→</span>
                </div>
              ))}
              {selector}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
