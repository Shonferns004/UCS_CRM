import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';
import { messageLogApi, type MessageLogRow } from '../services/messageLogs';

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

// "2026-11" -> "November 2026", the same month the server buckets by.
const formatMonth = (value: string) => {
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const NO_VALUES: string[] = [];

// Session list on the left; the deleted messages of that session (and who deleted them) on the
// right, filtered by month and by the station the deleter worked from.
export function MessageLogs() {
  const sessionsQuery = useQuery({
    queryKey: ['openwa-message-log-sessions'],
    queryFn: messageLogApi.sessions,
    staleTime: 30_000,
  });
  const sessions = sessionsQuery.data?.sessions || [];
  const [selectedId, setSelectedId] = useState('');
  const [month, setMonth] = useState('');
  const [station, setStation] = useState('');

  // Choosing a session drops the previous session's filters: a station from one session means
  // nothing in another.
  const selectSession = (id: string) => {
    setSelectedId(id);
    setMonth('');
    setStation('');
  };

  useEffect(() => {
    if (!selectedId && sessions[0]) {
      setSelectedId(sessions[0].id);
      setMonth('');
      setStation('');
    }
  }, [sessions, selectedId]);

  const selected = useMemo(
    () => sessions.find(session => session.id === selectedId) || null,
    [sessions, selectedId],
  );

  const filtersQuery = useQuery({
    queryKey: ['openwa-message-log-filters', selectedId],
    queryFn: () => messageLogApi.filters(selectedId),
    enabled: Boolean(selectedId),
    staleTime: 30_000,
  });
  const months = filtersQuery.data?.months ?? NO_VALUES;
  const stations = filtersQuery.data?.stations ?? NO_VALUES;

  // A filter whose last row was deleted elsewhere must not leave an empty table behind.
  useEffect(() => {
    if (!filtersQuery.data) return;
    if (month && !months.includes(month)) setMonth('');
    if (station && !stations.includes(station)) setStation('');
  }, [filtersQuery.data, month, months, station, stations]);

  const monthOptions = useMemo(
    () => [
      { value: '', label: 'All months' },
      ...months.map(value => ({ value, label: formatMonth(value) })),
    ],
    [months],
  );
  const stationOptions = useMemo(
    () => [{ value: '', label: 'All stations' }, ...stations.map(value => ({ value, label: value }))],
    [stations],
  );

  const logsQuery = useQuery({
    queryKey: ['openwa-message-logs', selectedId, month, station],
    queryFn: () => messageLogApi.logs(selectedId, { month, station }),
    enabled: Boolean(selectedId),
    staleTime: 10_000,
  });
  const rows: MessageLogRow[] = logsQuery.data?.logs || [];

  return (
    <div className="message-logs-page">
      <aside className="message-logs-sessions">
        <div className="message-logs-sessions-head">
          <span>Sessions</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void sessionsQuery.refetch()}
            title="Refresh sessions"
            aria-label="Refresh sessions"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {sessionsQuery.isLoading ? (
          <div className="message-logs-state"><Loader2 className="animate-spin" size={20} /></div>
        ) : sessionsQuery.isError ? (
          <div className="message-logs-state" role="alert">
            Could not load sessions
          </div>
        ) : sessions.length === 0 ? (
          <div className="message-logs-state">No sessions found</div>
        ) : (
          sessions.map(session => (
            <button
              key={session.id}
              type="button"
              className={`message-logs-session ${session.id === selectedId ? 'active' : ''}`}
              onClick={() => selectSession(session.id)}
            >
              <span className="message-logs-session-name">{session.name}</span>
              <span className="message-logs-session-phone">{session.phone || '—'}</span>
            </button>
          ))
        )}
      </aside>

      <section className="message-logs-list">
        <div className="message-logs-list-head">
          <div>
            <h2>{selected?.name || 'Deleted messages'}</h2>
            <p>
              {selected
                ? `Deleted messages for ${selected.name} (${selected.phone || 'no number'})`
                : 'Pick a session to see who deleted what.'}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void logsQuery.refetch()}
            disabled={!selectedId || logsQuery.isFetching}
          >
            {logsQuery.isFetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>

        <div className="message-logs-filters">
          <div className="message-logs-filter">
            <CalendarDays size={14} />
            <CustomSelect value={month} onChange={setMonth} options={monthOptions} ariaLabel="Month" />
          </div>
          <div className="message-logs-filter">
            <MapPin size={14} />
            <CustomSelect value={station} onChange={setStation} options={stationOptions} ariaLabel="Station" />
          </div>
        </div>

        {!selectedId ? (
          <div className="message-logs-state">Select a session on the left.</div>
        ) : logsQuery.isLoading ? (
          <div className="message-logs-state"><Loader2 className="animate-spin" size={28} /></div>
        ) : logsQuery.isError ? (
          <div className="message-logs-state" role="alert">
            Could not load this session's deleted messages
          </div>
        ) : rows.length === 0 ? (
          <div className="message-logs-state">
            No deleted messages for this session{month || station ? ' with these filters' : ''}.
          </div>
        ) : (
          <div className="message-logs-table">
            <div className="message-log-row message-log-header deleted-only">
              <span>Timestamp</span>
              <span>Deleted by</span>
              <span>Station</span>
              <span>Chat</span>
              <span>Message before delete</span>
            </div>
            {rows.map(row => {
              const when = formatWhen(row.createdAt);
              return (
                <div key={`${row.id}-${row.createdAt}`} className="message-log-row deleted-only">
                  <span className="message-log-time">
                    <strong>{when.date}</strong>
                    <small>{when.time}</small>
                  </span>
                  <span className="message-log-actor">
                    <strong>{row.actor_name || 'Not recorded'}</strong>
                    {row.for_everyone === false ? <small>for me</small> : null}
                  </span>
                  <span className="message-log-station">{row.station || '—'}</span>
                  <span className="message-log-chat" title={row.chat_id}>
                    {row.chat_name || cleanNumber(row.chat_id)}
                  </span>
                  <span className="message-log-body" title={row.body || ''}>
                    {row.body || <em>Content not recorded</em>}
                    {row.type || row.direction ? (
                      <small className="message-log-type">
                        {[row.type, row.direction === 'outgoing' ? 'sent by us' : row.direction === 'incoming' ? 'received' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
