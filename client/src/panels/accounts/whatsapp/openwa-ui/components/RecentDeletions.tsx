import { useQuery } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { messageLogApi } from '../services/messageLogs';
import './RecentDeletions.css';

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  voice: 'Voice',
  document: 'Document',
  sticker: 'Sticker',
  location: 'Location',
  contact: 'Contact',
  poll: 'Poll',
  call: 'Call',
  revoked: 'Deleted',
  order: 'Order',
  product: 'Product',
  unknown: 'Unknown',
};

const typeLabel = (value?: string | null) => {
  const key = String(value || '').toLowerCase();
  if (!key) return 'Unknown';
  return TYPE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
};

const cleanNumber = (value?: string | null) => {
  const digits = String(value || '').split('@')[0].replace(/\D/g, '');
  return digits || '—';
};

const formatWhen = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: '' };
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
};

/**
 * Dashboard strip: the latest deletions across every session, with the person and station behind
 * each one. The per-session view lives in Logs; this answers "what was deleted and by whom" at a
 * glance, and the type breakdown says what kind of content is being removed.
 */
export function RecentDeletions({ onViewAll }: { onViewAll?: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['openwa-recent-deletions'],
    queryFn: () => messageLogApi.recent(8),
    staleTime: 15_000,
  });

  const items = data?.items || [];
  const byType = data?.byType || [];

  // A 403 means this viewer cannot read the deletion audit at all; showing an empty card would
  // suggest nothing was ever deleted.
  if (isError) return null;

  return (
    <section className="recent-deletions">
      <div className="recent-deletions-head">
        <div className="recent-deletions-title">
          <Trash2 size={18} />
          <div>
            <h2>Recent deleted messages</h2>
            <p>
              {data
                ? `${data.total.toLocaleString()} deletion${data.total === 1 ? '' : 's'} with the person who did it`
                : 'Who deleted what, across every session'}
            </p>
          </div>
        </div>
        {onViewAll && (
          <button type="button" className="btn-secondary" onClick={onViewAll}>
            View all logs
          </button>
        )}
      </div>

      {byType.length > 0 && (
        <div className="recent-deletions-types">
          <span className="recent-types-label">By type</span>
          {byType.map(entry => (
            <span key={entry.type} className="recent-type-chip">
              {typeLabel(entry.type)}
              <strong>{entry.count.toLocaleString()}</strong>
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="recent-deletions-state">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="recent-deletions-state">No deletions recorded yet.</div>
      ) : (
        <div className="recent-deletions-list">
          {items.map(row => {
            const when = formatWhen(row.createdAt);
            return (
              <div className="recent-deletion" key={row.id}>
                <span className="recent-when">
                  <strong>{when.date}</strong>
                  <small>{when.time}</small>
                </span>
                <span className="recent-who">
                  <strong>{row.actor_name || 'Not recorded'}</strong>
                  <small>
                    {row.station || 'No station'}
                    {row.session_name ? ` · ${row.session_name}` : ''}
                  </small>
                </span>
                <span className="recent-chat" title={row.chat_id}>
                  {row.chat_name || cleanNumber(row.chat_id)}
                </span>
                <span className="recent-body" title={row.body || ''}>
                  {row.body || <em>Content not recorded</em>}
                  <small>
                    {typeLabel(row.type)}
                    {row.direction === 'outgoing'
                      ? ' · sent by us'
                      : row.direction === 'incoming'
                        ? ' · received'
                        : ''}
                  </small>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
