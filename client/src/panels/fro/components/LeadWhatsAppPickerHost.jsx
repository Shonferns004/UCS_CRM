import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Smartphone, Star, X } from 'lucide-react';
import {
  settleLeadWhatsAppChoice,
  subscribeLeadWhatsAppPicker,
} from '../utils/leadWhatsAppPickerStore';

// What each history verdict means to an FRO choosing a number. The picker is a choice, not an
// automatic decision: these labels explain what the backend saw so the operator can override it.
const STATE_META = {
  answered: { label: 'Donor replied here', tone: 'good' },
  delivered: { label: 'Messages delivered', tone: 'good' },
  'awaiting-delivery': { label: 'Recent message', tone: 'wait' },
  unknown: { label: 'No chat history', tone: 'muted' },
  'suspected-blocked': { label: 'Not delivered', tone: 'bad' },
  failed: { label: 'Send failed', tone: 'bad' },
};

const TONES = {
  good: { color: '#166534', background: '#dcfce7', border: '#86efac' },
  wait: { color: '#92400e', background: '#fef3c7', border: '#fcd34d' },
  muted: { color: '#475569', background: '#f1f5f9', border: '#e2e8f0' },
  bad: { color: '#991b1b', background: '#fee2e2', border: '#fca5a5' },
};

function prettyPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 10) {
    const country = digits.slice(0, digits.length - 10);
    const rest = digits.slice(-10);
    return `+${country} ${rest.slice(0, 5)} ${rest.slice(5)}`;
  }
  return `+${digits}`;
}

function StateChip({ state }) {
  const meta = STATE_META[state] || STATE_META.unknown;
  const tone = TONES[meta.tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        color: tone.color,
        background: tone.background,
        border: `1px solid ${tone.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.tone === 'good' && <CheckCircle2 size={11} />}
      {meta.tone === 'bad' && <AlertTriangle size={11} />}
      {meta.label}
    </span>
  );
}

export default function LeadWhatsAppPickerHost() {
  const [request, setRequest] = useState(null);
  const firstOptionRef = useRef(null);

  useEffect(() => subscribeLeadWhatsAppPicker(setRequest), []);

  useEffect(() => {
    if (!request) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') settleLeadWhatsAppChoice(request.requestId, null);
    };
    window.addEventListener('keydown', onKey);
    firstOptionRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  if (!request) return null;

  const { options, donorName, mobile, allBlocked, requestId } = request;
  const close = () => settleLeadWhatsAppChoice(requestId, null);
  const choose = option => settleLeadWhatsAppChoice(requestId, option);

  return (
    <div
      className="modal-overlay"
      onClick={close}
      style={{ zIndex: 100050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose WhatsApp number"
        onClick={event => event.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            background: 'var(--card-bg)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: '#25D366',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Smartphone size={18} color="#fff" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>Which WhatsApp to open?</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
              {donorName}
              {mobile ? ` · ${prettyPhone(mobile)}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-icon"
            onClick={close}
            aria-label="Close"
            style={{ padding: 4, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '14px 16px', overflowY: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {allBlocked && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                padding: '9px 11px',
                borderRadius: 10,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: 11.5,
                lineHeight: 1.45,
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Koi bhi number is donor ke liye reliably reachable nahi lag raha. Aap phir bhi koi
                number chun sakte hain — message bhejne ke baad delivery check karein.
              </span>
            </div>
          )}

          {options.map((option, index) => {
            const phone = prettyPhone(option.phone);
            const label = option.sessionName || `${option.station} WhatsApp`;
            const offline = option.status && option.status !== 'ready';
            return (
              <button
                key={`${option.sessionId}-${option.station}-${index}`}
                ref={index === 0 ? firstOptionRef : undefined}
                type="button"
                onClick={() => choose(option)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '11px 12px',
                  borderRadius: 12,
                  border: option.recommended ? '1.5px solid #16a34a' : '1px solid var(--line)',
                  background: 'var(--card-bg)',
                  cursor: 'pointer',
                  boxShadow: option.recommended ? '0 0 0 3px rgba(22,163,74,.10)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: option.recommended ? '#dcfce7' : '#f1f5f9',
                    color: option.recommended ? '#166534' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {(String(label).trim()[0] || 'W').toUpperCase()}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{label}</span>
                    {option.recommended && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: '#16a34a',
                          color: '#fff',
                          fontSize: 9.5,
                          fontWeight: 800,
                          letterSpacing: '.2px',
                        }}
                      >
                        <Star size={9} fill="#fff" /> RECOMMENDED
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
                      {phone || 'Number not reported'}
                    </span>
                    {option.station && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 5,
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1e40af',
                        }}
                      >
                        {option.station}
                      </span>
                    )}
                    {offline && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c' }}>
                        {option.status}
                      </span>
                    )}
                  </div>
                </div>

                <StateChip state={option.state} />
              </button>
            );
          })}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', background: 'var(--card-bg)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm" onClick={close} style={{ fontSize: 12 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
