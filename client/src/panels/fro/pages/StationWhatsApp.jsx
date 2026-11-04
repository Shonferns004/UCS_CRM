import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Smartphone } from 'lucide-react';
import { api } from '../../../api/auth';

// The vendored chats UI is lazy-loaded: an FRO who never opens the tab never downloads it.
const OpenWAEmbed = lazy(() => import('../../accounts/whatsapp/openwa-ui/OpenWAEmbed'));

export default function StationWhatsApp() {
  const [searchParams] = useSearchParams();
  const wantedSession = searchParams.get('session');
  const wantedStation = searchParams.get('station');
  const wantedChat = searchParams.get('chat');
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api('/openwa-assignments/mine')
      .then(data => {
        if (!alive) return;
        const list = data?.assignments || [];
        // A number can serve several stations; the query's station is only a hint, so match the
        // session first and accept the station from its `stations` list.
        const servesStation = item =>
          !wantedStation ||
          (item.stations?.some(row => row.station === wantedStation) ?? item.station === wantedStation);
        const found = wantedSession
          ? list.find(item => item.sessionId === wantedSession && servesStation(item)) || null
          : list.find(servesStation) || list[0] || null;
        setAssignment(found);
        if (!found) {
          setError(
            wantedSession
              ? 'This WhatsApp is no longer assigned to you.'
              : 'No WhatsApp session is assigned to your station yet.',
          );
        }
      })
      .catch(err => {
        if (alive) setError(err?.message || 'Could not load your WhatsApp assignment.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [wantedSession, wantedStation]);

  return (
    <div className="fro-station-whatsapp">
      <style>{`
        .panel-fro .content-body:has(.fro-station-whatsapp) { padding: 0; overflow: hidden; }
        .fro-station-whatsapp { height: 100%; min-height: 0; display: flex; flex-direction: column; }
        .fro-station-whatsapp > * { flex: 1; min-width: 0; min-height: 0; }
        .fro-station-whatsapp-state {
          height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 32px; color: var(--ink-soft, #6b7280); text-align: center;
        }
        .fro-station-whatsapp-state h2 { margin: 0; font-size: 18px; color: var(--ink, #1a1a2e); }
      `}</style>

      {loading ? (
        <div className="fro-station-whatsapp-state">
          <Loader2 className="animate-spin" size={28} />
          <p>Loading your WhatsApp…</p>
        </div>
      ) : !assignment ? (
        <div className="fro-station-whatsapp-state">
          <Smartphone size={40} />
          <h2>Station WhatsApp</h2>
          <p>{error || 'No WhatsApp session is assigned to your station yet.'}</p>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="fro-station-whatsapp-state">
              <Loader2 className="animate-spin" size={28} />
              <p>Opening {assignment.ngoName || assignment.station} WhatsApp…</p>
            </div>
          }
        >
          <OpenWAEmbed
        page="chats"
        fro
        lockedSessionId={assignment.sessionId}
        initialPhone={wantedChat}
      />
        </Suspense>
      )}
    </div>
  );
}
