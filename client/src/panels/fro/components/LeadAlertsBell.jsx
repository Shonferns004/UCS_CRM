import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Inbox, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Topbar bell for new-lead alerts.
//
// The badge reads durable rows from /fro/lead-alerts, so it is correct after a
// refresh and after a dropped socket. A realtime `lead:new` event only makes it
// pulse; it never owns the state.
// ---------------------------------------------------------------------------

const SOURCE_STYLE = {
  whatsapp: { label: 'WhatsApp', color: '#128C7E', bg: '#dcfce7' },
  meta: { label: 'Meta', color: '#0866FF', bg: '#e7f0ff' },
  email: { label: 'Email', color: '#7c3aed', bg: '#ede9fe' },
};

export function sourceKeyOf(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('meta')) return 'meta';
  if (v.includes('email')) return 'email';
  return 'whatsapp';
}

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function Badge({ value, color }) {
  return (
    <span
      style={{
        position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16,
        padding: '0 4px', borderRadius: 999, background: color, color: '#fff',
        fontSize: 9.5, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
        boxShadow: '0 0 0 2px var(--card-bg, #fff)',
      }}
    >
      {value > 9 ? '9+' : value}
    </span>
  );
}

function AlertRow({ alert, onOpen }) {
  const source = SOURCE_STYLE[sourceKeyOf(alert.source)];
  const seen = Boolean(alert.seen_at);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(alert)}
      style={{
        display: 'flex', width: '100%', gap: 9, padding: '9px 12px',
        border: 'none', borderTop: '1px solid var(--line, #e2e8f0)',
        background: seen ? 'transparent' : 'rgba(22,163,74,.06)',
        textAlign: 'left', cursor: 'pointer', alignItems: 'flex-start',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7, height: 7, borderRadius: 999, marginTop: 6, flexShrink: 0,
          background: seen ? '#cbd5e1' : '#dc2626',
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, fontWeight: seen ? 600 : 800, color: 'var(--ink, #0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alert.body || 'New lead'}
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: source.color, background: source.bg, padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap' }}>
            {source.label}{Number.isFinite(Number(alert.score)) ? ` · ${alert.score}%` : ''}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 10.5, color: 'var(--ink-soft, #64748b)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.station || 'Station pending'}</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span style={{ whiteSpace: 'nowrap' }}>{seen ? 'Seen · ' : ''}{timeAgo(alert.created_at)}</span>
        </span>
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--sage, #16a34a)', padding: '3px 8px', borderRadius: 7, border: '1px solid var(--sage, #16a34a)', whiteSpace: 'nowrap' }}>
        Open
      </span>
    </button>
  );
}

export default function LeadAlertsBell({
  alerts = [],
  counts = { pending: 0, unseen: 0 },
  loading = false,
  error = '',
  pulse = false,
  onOpen,
  onViewAll,
  onRefresh,
  onOpenChange,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, right: 16 });

  // Anchor the panel to the button's real bottom edge. The old absolute
  // `calc(100% + 8px)` was measured against the 32px button, so the panel
  // started inside the 64px topbar and covered the navigation.
  const placePanel = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    placePanel();
    const reposition = () => placePanel();
    window.addEventListener('resize', reposition);
    // Capture catches scrolls inside the content area too, not just the window.
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, placePanel]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Let the panel suppress its own arrival card while the list is already open.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const unseen = Number(counts?.unseen) || 0;
  const pending = Number(counts?.pending) || 0;
  const badge = unseen > 0 ? unseen : pending;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="New lead alerts"
        title="New leads"
        onClick={() => {
          const next = !open;
          if (next) placePanel();
          setOpen(next);
          if (next) onRefresh?.();
        }}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--ink-soft, #64748b)',
        }}
      >
        <Bell size={20} strokeWidth={2} className={pulse ? 'lead-bell-ring' : undefined} />
        {badge > 0 && <Badge value={badge} color={unseen > 0 ? '#dc2626' : '#b45309'} />}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', top: pos.top, right: pos.right, width: 360,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: `calc(100vh - ${pos.top + 12}px)`,
            overflowY: 'auto', zIndex: 3000,
            background: 'var(--card-bg, #fff)', border: '1px solid var(--line, #e2e8f0)',
            borderRadius: 12, boxShadow: '0 18px 40px rgba(15,23,42,.16)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', position: 'sticky', top: 0, background: 'var(--card-bg, #fff)', zIndex: 1 }}>
            <strong style={{ fontSize: 12.5, color: 'var(--ink, #0f172a)' }}>New Leads</strong>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: unseen > 0 ? '#dc2626' : '#64748b' }}>
                {unseen > 0 ? `${unseen} new` : `${pending} pending`}
              </span>
              <button
                type="button"
                aria-label="Refresh alerts"
                onClick={() => onRefresh?.()}
                style={{ display: 'inline-flex', padding: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft, #64748b)' }}
              >
                <RefreshCw size={12} className={loading ? 'lead-bell-spin' : undefined} />
              </button>
            </span>
          </div>

          {loading && !alerts.length && (
            <div style={{ padding: '14px 12px', fontSize: 11.5, color: 'var(--ink-soft, #64748b)' }}>Loading alerts…</div>
          )}

          {error && (
            <div style={{ margin: 10, padding: '8px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 11.5, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {!loading && !error && alerts.length === 0 && (
            <div style={{ padding: '26px 16px', textAlign: 'center' }}>
              <Inbox size={24} style={{ opacity: 0.3, marginBottom: 6 }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)' }}>No new leads</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', marginTop: 2 }}>No new leads on your station yet.</div>
            </div>
          )}

          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onOpen={(a) => { setOpen(false); onOpen?.(a); }}
            />
          ))}

          <button
            type="button"
            onClick={() => { setOpen(false); onViewAll?.(); }}
            style={{
              width: '100%', padding: '10px 12px', border: 'none', borderTop: '1px solid var(--line, #e2e8f0)',
              background: 'var(--bg, #f8fafc)', color: 'var(--ink, #0f172a)', fontSize: 11.5, fontWeight: 700,
              cursor: 'pointer', textAlign: 'center',
            }}
          >
            View all in My Leads →
          </button>
        </div>,
        document.body,
      )}

      <style>{`
        @keyframes lead-bell-shake {
          0%, 100% { transform: rotate(0); }
          20% { transform: rotate(12deg); }
          40% { transform: rotate(-10deg); }
          60% { transform: rotate(8deg); }
          80% { transform: rotate(-6deg); }
        }
        .lead-bell-ring { animation: lead-bell-shake .7s ease-in-out 2; transform-origin: 50% 15%; }
        @keyframes lead-bell-rotate { to { transform: rotate(360deg); } }
        .lead-bell-spin { animation: lead-bell-rotate .8s linear infinite; }
      `}</style>
    </div>
  );
}
