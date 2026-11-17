import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { sourceKeyOf } from './LeadAlertsBell';

// ---------------------------------------------------------------------------
// Top-right arrival card.
//
// Shown for a few seconds when a lead lands, then it minimises itself and the
// bell keeps the badge. Dismissing the card must NOT mark the lead seen — only
// opening it does.
// ---------------------------------------------------------------------------

const SOURCE_LABEL = { whatsapp: 'WhatsApp', meta: 'Meta', email: 'Email' };

export default function LeadAlertToast({ alert, more = 0, onOpen, onDismiss }) {
  const [closing, setClosing] = useState(false);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!alert) return undefined;
    setClosing(false);
    // Minimise toward the bell instead of vanishing, so the eye follows the
    // alert to where it will live until the lead is worked.
    const minimise = setTimeout(() => setClosing(true), 6000);
    const remove = setTimeout(() => dismissRef.current?.(), 6180);
    return () => { clearTimeout(minimise); clearTimeout(remove); };
  }, [alert?.id]);

  if (!alert) return null;

  const source = SOURCE_LABEL[sourceKeyOf(alert.source)];
  const score = Number.isFinite(Number(alert.score)) ? `${alert.score}%` : '';

  // Portal to <body>: the FRO shell uses sticky/overflow containers, and a
  // `position: fixed` child inside one of them is clipped or re-anchored.
  return createPortal(
    <div
      role="status"
      style={{
        position: 'fixed', top: 76, right: 16, zIndex: 3100, width: 300, maxWidth: 'calc(100vw - 24px)',
        background: 'var(--card-bg, #fff)', border: '1px solid var(--line, #e2e8f0)', borderRadius: 12,
        boxShadow: '0 18px 40px rgba(15,23,42,.18)', padding: '11px 12px',
        transformOrigin: 'top right',
        animation: closing ? 'lead-toast-out .18s ease-in forwards' : 'lead-toast-in .22s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ display: 'inline-flex', width: 24, height: 24, borderRadius: 8, background: 'rgba(22,163,74,.12)', color: 'var(--sage, #16a34a)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bell size={13} />
        </span>
        <strong style={{ flex: 1, fontSize: 12, color: 'var(--ink, #0f172a)' }}>
          {more > 0 ? `${more + 1} new leads received` : 'New lead received'}
        </strong>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft, #64748b)', fontSize: 15, lineHeight: 1, padding: 2 }}
        >
          ×
        </button>
      </div>

      <div style={{ marginTop: 7, fontSize: 12.5, fontWeight: 800, color: 'var(--ink, #0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {alert.body || 'New lead'}
      </div>
      <div style={{ marginTop: 1, fontSize: 10.5, color: 'var(--ink-soft, #64748b)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>{source}{score ? ` · ${score}` : ''}</span>
        <span style={{ opacity: 0.5 }}>•</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.station || 'Station pending'}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 9 }}>
        <button
          type="button"
          onClick={() => onOpen?.(alert)}
          style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--sage, #16a34a)', color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
        >
          Open
        </button>
      </div>

      <style>{`
        @keyframes lead-toast-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lead-toast-out {
          to { opacity: 0; transform: translate(46px, -20px) scale(.55); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
