import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../api/auth';
import { useRealtime } from '../hooks/useRealtime';

// Polls GET /tickets/pending-popups — tickets aimed at this user's panel that
// they have not acknowledged yet — and pops the newest one up. Dismissing it
// acks on the server (ticket_popup_seen), so each person sees each ticket
// exactly once, on any device. support_tickets / developer_tickets writes are
// broadcast (REALTIME_TABLES), so a freshly raised ticket pops within a second
// instead of waiting for the next poll.
const POLL_MS = 15000;
// Gap between dismissing one popup and showing the next queued one, so a
// batch of new tickets never marches across the screen back to back.
const NEXT_GAP_MS = 8000;

// Queue page per role — powers the "View tickets" button. Roles without an
// entry fall back to matching the current URL prefix; if neither matches the
// popup still shows, just without the button.
const QUEUE_PATHS = {
  accounts: '/accounts/tickets',
  hr: '/hr/tickets',
  event_head: '/event-head/all-tickets',
  event_manager: '/event-head/all-tickets',
  digital: '/dev-panel/tickets',
  developers: '/dev-panel/tickets',
  super_admin: '/sa/support-tickets',
  fro: '/fro/tickets',
  ngo_admin: '/ngo-admin/my-tickets',
  recruiter: '/recruiter/tickets',
};

const queuePathFor = (user, pathname) => {
  const role = String(user?.role || '').toLowerCase();
  if (QUEUE_PATHS[role]) return QUEUE_PATHS[role];
  if (pathname.startsWith('/accounts')) return QUEUE_PATHS.accounts;
  if (pathname.startsWith('/hr')) return QUEUE_PATHS.hr;
  if (pathname.startsWith('/event-head')) return QUEUE_PATHS.event_head;
  if (pathname.startsWith('/dev-panel')) return QUEUE_PATHS.digital;
  if (pathname.startsWith('/sa')) return QUEUE_PATHS.super_admin;
  if (pathname.startsWith('/fro')) return QUEUE_PATHS.fro;
  if (pathname.startsWith('/ngo-admin')) return QUEUE_PATHS.ngo_admin;
  if (pathname.startsWith('/recruiter')) return QUEUE_PATHS.recruiter;
  return null;
};

const PRIORITY_STYLE = {
  urgent: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  high: { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  medium: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  low: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
};

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

// Browser-local copy of the server's ack set. The server ack fires the moment
// a popup goes on screen; this backs it up so even a dropped ack cannot bring
// the same popup back on refresh. Keyed per user like NoticePopup's set.
const SEEN_KEY_BASE = 'tp_seen_v1';
const seenKeyFor = (user) => (user?.id ? `${SEEN_KEY_BASE}_${user.id}` : SEEN_KEY_BASE);
const readSeenLocal = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
};
const addSeenLocal = (key, id) => {
  try {
    const s = readSeenLocal(key);
    if (s.has(String(id))) return;
    s.add(String(id));
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch { /* ignore */ }
};

const TH_CSS = `
@keyframes th-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
`;

export default function TicketPopupHost() {
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  const inflightRef = useRef(false);
  const lastDismissRef = useRef(0);
  const gapTimerRef = useRef(null);
  const navigate = useNavigate();
  const user = getUser('ucs');
  const seenKey = seenKeyFor(user);
  const queuePath = queuePathFor(user, window.location.pathname);

  // Claim a ticket the instant it goes on screen. Waiting for the Dismiss
  // click meant refreshing (or just walking away) skipped the ack entirely
  // and the same popup came back — "once" has to survive an F5.
  const ackTicket = useCallback((t) => {
    if (!t) return;
    addSeenLocal(seenKey, t.id);
    api(`/tickets/${t.id}/popup-seen?source=${t.source === 'dev' ? 'dev' : 'sup'}`, {
      method: 'POST',
      body: JSON.stringify({}),
      _prefix: 'ucs',
    }).catch(() => { /* local set still blocks it here; dismiss retries */ });
  }, [seenKey]);

  const load = useCallback(async () => {
    if (inflightRef.current || currentRef.current) return;
    inflightRef.current = true;
    try {
      const data = await api('/tickets/pending-popups', { _prefix: 'ucs' });
      const arr = Array.isArray(data) ? data : [];
      if (currentRef.current) return;
      // A queue of several new tickets shows one at a time, not all at once.
      if (Date.now() - lastDismissRef.current < NEXT_GAP_MS) return;
      const local = readSeenLocal(seenKey);
      const next = arr.find(t => !local.has(String(t.id)));
      if (next) {
        currentRef.current = next;
        setCurrent(next);
        ackTicket(next);
      }
    } catch { /* 401 / offline — the next poll retries */ } finally {
      inflightRef.current = false;
    }
  }, [seenKey, ackTicket]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      clearInterval(t);
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    };
  }, [load]);

  useRealtime('support_tickets', { event: 'INSERT', onInsert: load });
  useRealtime('developer_tickets', { event: 'INSERT', onInsert: load });

  const dismiss = useCallback(async () => {
    const t = currentRef.current;
    currentRef.current = null;
    setCurrent(null);
    lastDismissRef.current = Date.now();
    if (t) {
      // Already acked on show; this is an idempotent second chance in case
      // that first POST got dropped.
      try {
        await api(`/tickets/${t.id}/popup-seen?source=${t.source === 'dev' ? 'dev' : 'sup'}`, {
          method: 'POST',
          body: JSON.stringify({}),
          _prefix: 'ucs',
        });
      } catch { /* best-effort */ }
    }
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    gapTimerRef.current = setTimeout(() => {
      lastDismissRef.current = 0;
      load();
    }, NEXT_GAP_MS);
  }, [load]);

  const view = useCallback(async () => {
    const path = queuePath;
    await dismiss();
    if (path) navigate(path);
  }, [dismiss, navigate, queuePath]);

  if (!current) return null;

  const pstyle = PRIORITY_STYLE[String(current.priority || '').toLowerCase()] || PRIORITY_STYLE.medium;
  const isNew = Date.now() - new Date(current.created_at).getTime() < 60 * 60 * 1000;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99996, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{TH_CSS}</style>
      <div style={{ width: 'min(460px, 100%)', maxHeight: '92vh', overflowY: 'auto', borderRadius: 18, background: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,.35)', animation: 'th-pop .45s cubic-bezier(.22,1,.36,1)', position: 'relative' }}>
        <div style={{ height: 4, borderRadius: '18px 18px 0 0', background: 'linear-gradient(90deg,#f59e0b,#ef4444,#e11d48)', position: 'absolute', top: 0, left: 0, right: 0 }} />
        <div style={{ position: 'absolute', top: 12, right: 12, cursor: 'pointer', width: 30, height: 30, borderRadius: 50, background: 'var(--line, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--ink, #0f172a)', zIndex: 2 }} onClick={dismiss}>✕</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 18px 0' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg,#f59e0b,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(239,68,68,.3)' }}>
            <span style={{ fontSize: 16, color: '#fff', fontWeight: 900 }}>!</span>
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 999 }}>New ticket raised</span>
        </div>
        <div style={{ padding: '10px 18px 18px' }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--ink, #0f172a)', marginTop: 4, lineHeight: 1.35 }}>{current.subject}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: pstyle.bg, color: pstyle.color, border: `1px solid ${pstyle.border}` }}>{current.priority || 'medium'}</span>
            {current.category && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{String(current.category).replace(/_/g, ' ')}</span>
            )}
            {current.desk_number && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>Desk {current.desk_number}</span>
            )}
            {current.reference_id && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>Ref {current.reference_id}</span>
            )}
          </div>
          {current.description && (
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft, #475569)', lineHeight: 1.6, marginTop: 10, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{current.description}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 11, color: 'var(--ink-soft, #94a3b8)', fontWeight: 600 }}>
            {current.raiser && <span>From {current.raiser}</span>}
            {current.raised_by_panel && <span>Panel: {current.raised_by_panel}</span>}
            {isNew && <span style={{ color: '#dc2626' }}>just now</span>}
            <span>{fmtTime(current.created_at)}</span>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={view}
              disabled={!queuePath}
              style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: queuePath ? 'var(--ink, #0f172a)' : '#e2e8f0', color: queuePath ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 13, cursor: queuePath ? 'pointer' : 'default', fontFamily: 'inherit' }}
            >View tickets</button>
            <button
              onClick={dismiss}
              style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--line, #e2e8f0)', background: '#fff', color: 'var(--ink, #0f172a)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  );
}
