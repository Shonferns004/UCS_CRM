import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Inbox, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Topbar bell for new-lead alerts.
//
// The badge reads durable rows from /fro/lead-alerts, so it is correct after a
// refresh and after a dropped socket. A realtime `lead:new` event only makes it
// pulse; it never owns the state.
//
// While any alert is still unseen the bell keeps a continuous halo pulse, so a
// lead cannot sit unnoticed just because the one-shot shake already played. It
// stops only when every alert is seen (opened one by one or "Mark all read").
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

function initialsOf(value) {
  const text = String(value || '').trim();
  if (!text) return '?';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function Badge({ value, color }) {
  return (
    <span
      style={{
        position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16,
        padding: '0 4px', borderRadius: 999, background: color, color: '#fff',
        fontSize: 9.5, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
        boxShadow: '0 0 0 2px var(--card-bg, #fff)', zIndex: 1,
      }}
    >
      {value > 9 ? '9+' : value}
    </span>
  );
}

function SectionLabel({ children, count }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px 7px',
        fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
        textTransform: 'uppercase', color: 'var(--ink-soft, #64748b)',
        background: 'var(--bg, #f8fafc)',
        borderTop: '1px solid var(--line, #e2e8f0)',
      }}
    >
      <span>{children}</span>
      {Number.isFinite(count) && (
        <span
          style={{
            minWidth: 18, padding: '1px 6px', borderRadius: 999,
            background: 'rgba(220,38,38,.12)', color: '#dc2626',
            fontSize: 9.5, fontWeight: 800, textAlign: 'center',
          }}
        >
          {count}
        </span>
      )}
    </div>
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
        position: 'relative',
        display: 'flex', width: '100%', gap: 11, padding: '11px 14px 11px 17px',
        border: 'none', borderTop: '1px solid var(--line, #e2e8f0)',
        background: seen ? 'transparent' : 'rgba(22,163,74,.055)',
        textAlign: 'left', cursor: 'pointer', alignItems: 'flex-start',
        transition: 'background .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = seen ? '#f6f8fa' : 'rgba(22,163,74,.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = seen ? 'transparent' : 'rgba(22,163,74,.055)'; }}
    >
      {!seen && (
        <span
          aria-hidden
          style={{
            position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
            borderRadius: '0 3px 3px 0', background: 'var(--sage, #16a34a)',
          }}
        />
      )}

      <span
        aria-hidden
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 999, flexShrink: 0, marginTop: 1,
          background: source.bg, color: source.color,
          fontSize: 11, fontWeight: 800, letterSpacing: '.02em',
        }}
      >
        {initialsOf(alert.body)}
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 13, lineHeight: 1.3, color: 'var(--ink, #0f172a)',
              fontWeight: seen ? 600 : 800,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}
          >
            {alert.body || 'New lead'}
          </span>
          <span
            style={{
              fontSize: 10, fontWeight: 800, color: source.color, background: source.bg,
              padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {source.label}{Number.isFinite(Number(alert.score)) ? ` · ${alert.score}%` : ''}
          </span>
        </span>

        <span
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 10.5, color: 'var(--ink-soft, #64748b)', minWidth: 0,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alert.station || 'Station pending'}
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ whiteSpace: 'nowrap' }}>{timeAgo(alert.created_at)}</span>
          {!seen && (
            <span
              style={{
                marginLeft: 2, padding: '0 6px', borderRadius: 999,
                background: '#dc2626', color: '#fff',
                fontSize: 8.5, fontWeight: 800, letterSpacing: '.05em', lineHeight: '14px',
              }}
            >
              NEW
            </span>
          )}
          {seen && <span style={{ whiteSpace: 'nowrap' }}>· Seen</span>}
        </span>
      </span>

      <span
        style={{
          alignSelf: 'center', flexShrink: 0,
          fontSize: 10.5, fontWeight: 800, color: 'var(--sage, #16a34a)',
          padding: '4px 9px', borderRadius: 7,
          border: '1px solid var(--sage, #16a34a)', whiteSpace: 'nowrap',
        }}
      >
        Open ›
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
  onMarkAllRead,
  markingAll = false,
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
  const hasUnseen = unseen > 0;

  const { unseenAlerts, seenAlerts } = useMemo(() => {
    const next = alerts || [];
    return {
      unseenAlerts: next.filter((a) => !a.seen_at),
      seenAlerts: next.filter((a) => a.seen_at),
    };
  }, [alerts]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="New lead alerts"
        title={hasUnseen ? `${unseen} unseen new lead${unseen === 1 ? '' : 's'}` : 'New leads'}
        onClick={() => {
          const next = !open;
          if (next) placePanel();
          setOpen(next);
          if (next) onRefresh?.();
        }}
        className={hasUnseen ? 'lead-bell-attention' : undefined}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 6, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer',
          color: hasUnseen ? '#dc2626' : 'var(--ink-soft, #64748b)',
          // Consumed by the halo keyframes in the style block below.
          '--bell-halo': hasUnseen ? 'rgba(220,38,38,.35)' : 'rgba(180,83,9,.3)',
        }}
      >
        {hasUnseen && <span className="lead-bell-ping" aria-hidden />}
        <Bell size={20} strokeWidth={2} className={pulse ? 'lead-bell-ring' : undefined} />
        {badge > 0 && <Badge value={badge} color={unseen > 0 ? '#dc2626' : '#b45309'} />}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="New leads"
          style={{
            position: 'fixed', top: pos.top, right: pos.right, width: 440,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: `calc(100vh - ${pos.top + 16}px)`,
            display: 'flex', flexDirection: 'column',
            zIndex: 3000, overflow: 'hidden',
            background: 'var(--card-bg, #fff)', border: '1px solid var(--line, #e2e8f0)',
            borderRadius: 14, boxShadow: '0 22px 48px rgba(15,23,42,.18)',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '13px 14px', borderBottom: '1px solid var(--line, #e2e8f0)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <strong style={{ fontSize: 14, color: 'var(--ink, #0f172a)' }}>New Leads</strong>
              <span
                style={{
                  fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                  color: hasUnseen ? '#dc2626' : '#64748b',
                  background: hasUnseen ? 'rgba(220,38,38,.1)' : 'var(--bg, #f1f5f9)',
                  whiteSpace: 'nowrap',
                }}
              >
                {hasUnseen ? `${unseen} new` : `${pending} pending`}
              </span>
            </span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {hasUnseen && onMarkAllRead && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={markingAll}
                  title="Mark all as read"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 8px', borderRadius: 7, border: '1px solid var(--line, #e2e8f0)',
                    background: '#fff', color: 'var(--ink, #0f172a)',
                    fontSize: 10.5, fontWeight: 700, cursor: markingAll ? 'default' : 'pointer',
                    opacity: markingAll ? 0.6 : 1, whiteSpace: 'nowrap',
                  }}
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button
                type="button"
                aria-label="Refresh alerts"
                onClick={() => onRefresh?.()}
                style={{ display: 'inline-flex', padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft, #64748b)' }}
              >
                <RefreshCw size={13} className={loading ? 'lead-bell-spin' : undefined} />
              </button>
            </span>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && !alerts.length && (
              <div style={{ padding: '18px 14px', fontSize: 12, color: 'var(--ink-soft, #64748b)' }}>Loading alerts…</div>
            )}

            {error && (
              <div style={{ margin: 12, padding: '9px 11px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 11.5, fontWeight: 600 }}>
                {error}
              </div>
            )}

            {!loading && !error && alerts.length === 0 && (
              <div style={{ padding: '44px 20px 40px', textAlign: 'center' }}>
                <div
                  style={{
                    width: 52, height: 52, margin: '0 auto 12px', borderRadius: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg, #f1f5f9)', color: 'var(--ink-soft, #64748b)',
                  }}
                >
                  <Inbox size={24} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink, #0f172a)' }}>No new leads right now</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft, #64748b)', marginTop: 4, lineHeight: 1.5 }}>
                  New leads on your station will appear here.
                </div>
              </div>
            )}

            {unseenAlerts.length > 0 && (
              <>
                <SectionLabel count={unseenAlerts.length}>New</SectionLabel>
                {unseenAlerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} onOpen={(a) => { setOpen(false); onOpen?.(a); }} />
                ))}
              </>
            )}

            {seenAlerts.length > 0 && (
              <>
                <SectionLabel>Earlier</SectionLabel>
                {seenAlerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} onOpen={(a) => { setOpen(false); onOpen?.(a); }} />
                ))}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); onViewAll?.(); }}
            style={{
              width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--line, #e2e8f0)',
              background: 'var(--bg, #f8fafc)', color: 'var(--ink, #0f172a)', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', textAlign: 'center', flexShrink: 0,
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

        /* Continuous halo while any alert is still unseen. */
        @keyframes lead-bell-halo {
          0%   { box-shadow: 0 0 0 0 var(--bell-halo, rgba(220,38,38,.35)); }
          70%  { box-shadow: 0 0 0 10px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
        .lead-bell-attention { animation: lead-bell-halo 2s ease-out infinite; }

        @keyframes lead-bell-ping {
          0%   { transform: scale(.9); opacity: .7; }
          70%  { transform: scale(1.9); opacity: 0; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        .lead-bell-ping {
          position: absolute; top: -1px; right: -1px; width: 14px; height: 14px;
          border-radius: 999px; background: #dc2626; pointer-events: none;
          animation: lead-bell-ping 1.8s ease-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .lead-bell-attention, .lead-bell-ping, .lead-bell-ring { animation: none; }
        }
      `}</style>
    </div>
  );
}
