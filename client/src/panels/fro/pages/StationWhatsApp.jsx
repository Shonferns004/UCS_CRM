import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../../../api/auth';
import WhatsAppIcon from '../components/WhatsAppIcon';

// The vendored chats UI is lazy-loaded: an FRO who never opens WhatsApp never downloads it.
const OpenWAEmbed = lazy(() => import('../../accounts/whatsapp/openwa-ui/OpenWAEmbed'));

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

const servesStation = (assignment, station) =>
  !station ||
  (assignment.stations?.some(row => row.station === station) ?? assignment.station === station);

/**
 * The FRO WhatsApp workspace: a slim number switcher on the left, the selected number's chats
 * on the right. One sidebar entry ("WhatsApp") replaces the old per-number sidebar tabs.
 */
export default function StationWhatsApp() {
  const [searchParams, setSearchParams] = useSearchParams();
  const wantedSession = searchParams.get('session');
  const wantedStation = searchParams.get('station');
  const wantedChat = searchParams.get('chat');

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const read = useCallback(async () => {
    try {
      const data = await api('/openwa-assignments/mine', { cache: 'no-store' });
      const list = data?.assignments || [];
      setAssignments(list);
      setError(list.length ? '' : 'No WhatsApp session is assigned to your station yet.');
    } catch (err) {
      setError(err?.message || 'Could not load your WhatsApp numbers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void read();
    // A temporary grant can appear while the tab is open; refresh on return and periodically.
    const timer = setInterval(read, 45000);
    const onFocus = () => void read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [read]);

  const selected = useMemo(() => {
    if (assignments.length === 0) return null;
    return (
      (wantedSession &&
        assignments.find(a => a.sessionId === wantedSession && servesStation(a, wantedStation))) ||
      (wantedStation && assignments.find(a => servesStation(a, wantedStation))) ||
      assignments[0]
    );
  }, [assignments, wantedSession, wantedStation]);

  // Keep the URL on the number actually shown, so refresh/share reopens the same inbox.
  useEffect(() => {
    if (!selected || searchParams.get('session') === selected.sessionId) return;
    const next = new URLSearchParams(searchParams);
    next.set('session', selected.sessionId);
    if (selected.station) next.set('station', selected.station);
    else next.delete('station');
    next.delete('chat');
    setSearchParams(next, { replace: true });
  }, [selected, searchParams, setSearchParams]);

  const pick = assignment => {
    const next = new URLSearchParams(searchParams);
    next.set('session', assignment.sessionId);
    if (assignment.station) next.set('station', assignment.station);
    else next.delete('station');
    next.delete('chat');
    setSearchParams(next);
  };

  return (
    <div className="fro-station-whatsapp fro-whatsapp-workspace">
      <style>{`
        .panel-fro .content-body:has(.fro-whatsapp-workspace) { padding: 0; overflow: hidden; }
        .fro-whatsapp-workspace { height: 100%; min-height: 0; display: flex; }
        .fwa-shell { flex: 1; min-width: 0; min-height: 0; display: flex; }
        .fwa-rail {
          width: 208px; flex-shrink: 0; min-height: 0; display: flex; flex-direction: column;
          background: var(--bg, #f8fafc);
        }
        .fwa-rail-head {
          display: flex; align-items: center; gap: 7px; padding: 12px 12px 9px;
          border-bottom: 1px solid var(--line, #e8edf2);
          color: var(--ink, #0f172a); font-size: 12px; font-weight: 800; letter-spacing: .1px;
        }
        .fwa-rail-head svg { color: #128C7E; }
        .fwa-count {
          margin-left: auto; font-size: 9.5px; font-weight: 800; color: #128C7E;
          background: #EAF9F0; border: 1px solid #C9EED8;
          border-radius: 999px; padding: 1px 7px;
        }
        .fwa-list {
          flex: 1; min-height: 0; overflow-y: auto; padding: 6px;
          display: flex; flex-direction: column; gap: 2px;
          scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;
        }
        .fwa-list::-webkit-scrollbar { width: 5px; }
        .fwa-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
        .fwa-item {
          width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 7px;
          border: 1px solid transparent; border-radius: 10px; background: transparent;
          text-align: left; cursor: pointer; font-family: inherit;
          transition: background .15s ease, border-color .15s ease;
        }
        .fwa-item:hover { background: #EEF3F6; }
        .fwa-item.active {
          background: #EAF9F0; border-color: #BDE9CD;
        }
        .fwa-avatar {
          position: relative; width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #128C7E; color: #fff;
          font-size: 12px; font-weight: 800;
        }
        .fwa-avatar svg { color: #fff; }
        .fwa-avatar-bsct { background: #128C7E; }
        .fwa-avatar-mann { background: #B45309; }
        .fwa-avatar-aflf { background: #1D4ED8; }
        .fwa-avatar-other { background: #64748B; }
        .fwa-dot {
          position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px;
          border-radius: 50%; border: 1.5px solid #fff; background: #94a3b8;
        }
        .fwa-dot.ready { background: #22c55e; }
        .fwa-dot.failed { background: #ef4444; }
        .fwa-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
        .fwa-name {
          font-size: 11.5px; font-weight: 800; color: #0f172a; letter-spacing: .1px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fwa-sub {
          font-size: 10px; font-weight: 500; color: #64748b;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fwa-phone {
          font-size: 10px; font-weight: 500; color: #475569;
          font-variant-numeric: tabular-nums;
        }
        .fwa-chat { flex: 1; min-width: 0; min-height: 0; display: flex; }
        .fwa-chat > * { flex: 1; min-width: 0; min-height: 0; }
        .fwa-state {
          height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px; padding: 32px; color: var(--ink-soft, #6b7280); text-align: center;
        }
        .fwa-state h2 { margin: 0; font-size: 17px; color: var(--ink, #1a1a2e); }
        @media (max-width: 900px) {
          .fwa-rail { width: 68px; }
          .fwa-meta, .fwa-rail-head span:not(.fwa-count) { display: none; }
          .fwa-item { justify-content: center; }
          .fwa-rail-head { justify-content: center; }
        }
      `}</style>

      {loading ? (
        <div className="fwa-state">
          <Loader2 className="animate-spin" size={26} />
          <p>Loading your WhatsApp numbers…</p>
        </div>
      ) : !selected ? (
        <div className="fwa-state">
          <WhatsAppIcon size={38} />
          <h2>WhatsApp</h2>
          <p>{error || 'No WhatsApp session is assigned to your station yet.'}</p>
        </div>
      ) : (
        <div className="fwa-shell">
          {/* One number means there is nothing to switch: open its chats directly, full width. */}
          {assignments.length > 1 && (
          <aside className="fwa-rail" aria-label="Assigned WhatsApp numbers">
            <div className="fwa-rail-head">
              <WhatsAppIcon size={16} />
              <span>WhatsApp</span>
              <span className="fwa-count">{assignments.length}</span>
            </div>
            <div className="fwa-list">
              {assignments.map(assignment => {
                const active = assignment.sessionId === selected.sessionId;
                const stationLabel = assignment.stationLabel || assignment.station || '';
                // Session name is the identity now (short BSCT-1-1 style); the station list is
                // the supporting line, because the same number can serve several stations.
                const primaryName = assignment.sessionName || stationLabel || 'WhatsApp';
                const secondaryName =
                  stationLabel && stationLabel !== primaryName
                    ? stationLabel
                    : assignment.pushName || '';
                const phone = prettyPhone(assignment.phone);
                // A solid, NGO-coloured avatar (no gradient): BSCT/MANN/AFLF are visually
                // distinct, and an unassigned/unknown prefix falls back to slate.
                const ngoKey = String(assignment.sessionName || '').trim().toLowerCase().split('-')[0];
                const avatarTone = ['bsct', 'mann', 'aflf'].includes(ngoKey) ? ngoKey : 'other';
                return (
                  <button
                    key={assignment.sessionId}
                    type="button"
                    className={`fwa-item${active ? ' active' : ''}`}
                    onClick={() => pick(assignment)}
                    aria-current={active ? 'true' : undefined}
                    title={[primaryName, secondaryName, phone].filter(Boolean).join(' · ')}
                  >
                    <span className={`fwa-avatar fwa-avatar-${avatarTone}`}>
                      {String(primaryName).trim()[0]?.toUpperCase() || <WhatsAppIcon size={16} />}
                      <span
                        className={`fwa-dot${assignment.status === 'ready' ? ' ready' : assignment.status === 'failed' ? ' failed' : ''}`}
                      />
                    </span>
                    <span className="fwa-meta">
                      <span className="fwa-name">{primaryName}</span>
                      {secondaryName && <span className="fwa-sub">{secondaryName}</span>}
                      {phone && <span className="fwa-phone">{phone}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
          )}

          <section className="fwa-chat">
            <Suspense
              fallback={
                <div className="fwa-state">
                  <Loader2 className="animate-spin" size={26} />
                  <p>Opening {selected.sessionName || selected.station} WhatsApp…</p>
                </div>
              }
            >
              <OpenWAEmbed
                page="chats"
                fro
                lockedSessionId={selected.sessionId}
                initialPhone={selected.sessionId === wantedSession ? wantedChat : null}
              />
            </Suspense>
          </section>
        </div>
      )}
    </div>
  );
}
