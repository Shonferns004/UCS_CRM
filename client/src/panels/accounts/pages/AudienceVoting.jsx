import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';
import { toast } from '../../../components/Toast';

/**
 * Event admin for audience voting.
 *
 * The whole page is built around one thing: the organiser is standing at a
 * lectern with a phone full of faces and needs to put the next name on stage in
 * one tap. So the queue and the stage controls are the first thing on screen, in
 * that order, and the results board sits underneath where it can be scrolled to
 * but never gets in the way of running the room.
 *
 * The audience link is the same single URL for every event. There is no event id
 * in it, because there is no login on the audience side either: the phone asks
 * "what is live?" and gets whatever is running. That is what lets one QR code on
 * one slide work for the whole ceremony.
 */

const BOOTH_URL = `${window.location.origin}/audience-voting`;

// Poll the queue and results while something is running, so the rater count and
// the running averages move without the organiser refreshing. 5s is slow enough
// to be invisible to an admin and fast enough that the board is not stale when
// somebody walks up to read it.
const LIVE_POLL_MS = 5000;

const STATUS_PILL = {
  draft: { cls: 'pill-gray', label: 'Not started' },
  live: { cls: 'pill-green', label: 'Live' },
  completed: { cls: 'pill-blue', label: 'Completed' },
};

/** The five rating columns, in the order the audience is asked for them. */
const COLUMNS = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'confidence', label: 'Stage confidence' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'timing', label: 'Time taken' },
];

const fmt1 = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(1));

const Ic = ({ d, size = 14, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
    <path d={d} />
  </svg>
);
const IcUp = () => <Ic d="m18 15-6-6-6 6" />;
const IcDown = () => <Ic d="m6 9 6 6 6-6" />;
const IcMic = () => <Ic d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />;
const IcNext = () => <Ic d="M5 12h14M13 6l6 6-6 6" />;
const IcPlus = () => <Ic d="M12 5v14M5 12h14" />;
const IcTrash = () => <Ic d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />;
const IcCopy = () => <Ic d="M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />;
const IcPencil = () => <Ic d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />;

export default function AudienceVoting() {
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [newName, setNewName] = useState('');
  const [newSpeaker, setNewSpeaker] = useState('');
  const [busy, setBusy] = useState(false);

  const event = useMemo(() => events.find((e) => e.id === selectedId) || null, [events, selectedId]);

  const loadEvents = useCallback(async () => {
    const data = await apiGet('/audience-voting/events');
    const list = data?.events || [];
    setEvents(list);
    // Keep a selection across refreshes, but never leave the page pointing at an
    // event that was deleted underneath it.
    setSelectedId((prev) => (prev && list.some((e) => e.id === prev) ? prev : list[0]?.id ?? null));
    return list;
  }, []);

  const loadDetail = useCallback(async (id, { quiet = false } = {}) => {
    if (!id) {
      setDetail(null);
      setResults(null);
      return;
    }
    try {
      const [d, r] = await Promise.all([
        apiGet(`/audience-voting/events/${id}/participants`),
        apiGet(`/audience-voting/events/${id}/results`),
      ]);
      setDetail(d);
      setResults(r);
      if (!quiet) setErr('');
    } catch (e) {
      if (!quiet) setErr(e.message || 'Could not load this event');
    }
  }, []);

  useEffect(() => {
    loadEvents()
      .catch((e) => setErr(e.message || 'Could not load events'))
      .finally(() => setLoading(false));
  }, [loadEvents]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // While live, keep the voter count and the averages moving on their own.
  const live = event?.status === 'live';
  useEffect(() => {
    if (!selectedId || !live) return undefined;
    const id = setInterval(() => {
      loadDetail(selectedId, { quiet: true }).catch(() => {});
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [selectedId, live, loadDetail]);

  /** Run an action, toast the outcome, then re-read the event and its detail. */
  const act = async (fn, { success, refreshList = true } = {}) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success, 'success');
      if (refreshList) await loadEvents().catch(() => {});
      await loadDetail(selectedId, { quiet: true });
    } catch (e) {
      toast(e.message || 'That did not work', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createEvent = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await apiPost('/audience-voting/events', { name });
      setNewName('');
      const list = await loadEvents();
      // Open the event just created rather than leaving the organiser on whatever
      // was selected before.
      if (res?.event?.id) setSelectedId(res.event.id);
      else if (list[0]) setSelectedId(list[0].id);
      toast('Event created', 'success');
    } catch (e2) {
      toast(e2.message || 'Could not create the event', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addSpeaker = async (e) => {
    e.preventDefault();
    const name = newSpeaker.trim();
    if (!name || !event) return;
    setBusy(true);
    try {
      await apiPost(`/audience-voting/events/${event.id}/participants`, { name });
      setNewSpeaker('');
      await loadDetail(event.id, { quiet: true });
      toast(`${name} added to the queue`, 'success');
    } catch (e2) {
      toast(e2.message || 'Could not add that speaker', 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Move a speaker up or down the queue.
   *
   * Reordering sends the whole ordered id list rather than a "move up" command:
   * the database holds UNIQUE (event_id, order_index), so a swap cannot be
   * expressed as two independent single-row updates. The server validates the
   * list belongs to this event and parks the rows on negative indexes before
   * claiming the new ones.
   */
  const move = (index, delta) => {
    if (!event || !detail?.participants) return;
    const list = [...detail.participants];
    const to = index + delta;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    act(
      () => apiPost(`/audience-voting/events/${event.id}/next`, { order: list.map((p) => p.id) }),
      { success: null },
    );
  };

  const putOnStage = (p) =>
    act(
      () => apiPost(`/audience-voting/events/${event.id}/current`, { participant_id: p.id }),
      { success: `${p.name} is now on stage` },
    );

  const nextSpeaker = (wrap) =>
    act(
      () => apiPost(`/audience-voting/events/${event.id}/next`, { wrap }),
      { refreshList: false },
    );

  const setStatus = (action) =>
    act(() => apiPost(`/audience-voting/events/${event.id}/${action}`), {
      success: `Event ${action === 'start' ? 'started' : action === 'stop' ? 'stopped' : 'completed'}`,
    });

  const renameSpeaker = (p) => {
    const name = window.prompt('Speaker name', p.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === p.name) return;
    act(() => apiPut(`/audience-voting/events/${event.id}/participants/${p.id}`, { name: trimmed }), {
      success: 'Speaker renamed',
    });
  };

  const removeSpeaker = (p) => {
    // confirm() is used deliberately here rather than a modal: this page is often
    // open on a second screen during a live event, and a native dialog cannot be
    // dismissed by a stray click on the stage controls underneath it.
    if (!window.confirm(`Remove ${p.name} from the queue? Ratings already submitted for them are kept.`)) return;
    act(() => apiDelete(`/audience-voting/events/${event.id}/participants/${p.id}`), { success: 'Speaker removed' });
  };

  const deleteEvent = () => {
    if (!event) return;
    if (!window.confirm(`Delete "${event.name}"? All its ratings go with it. This cannot be undone.`)) return;
    act(() => apiDelete(`/audience-voting/events/${event.id}`), { success: 'Event deleted' });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(BOOTH_URL);
      toast('Audience link copied', 'success');
    } catch {
      // Clipboard needs a secure context, and the CRM is sometimes reached over
      // plain http on a LAN. Showing the URL is a usable fallback.
      window.prompt('Copy this link', BOOTH_URL);
    }
  };

  if (loading) return <div className="empty-state"><h3>Loading…</h3></div>;

  const participants = detail?.participants || [];
  const currentId = event?.current_participant_id ?? null;
  const current = participants.find((p) => p.id === currentId) || null;
  const rows = results?.results || [];
  const ratedCount = rows.filter((r) => r.rating_count > 0).length;

  return (
    <div className="av">
      {err && <div className="av-banner av-banner-error">{err}</div>}

      {/* ── Event picker ───────────────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <h3>Audience Voting</h3>
          <div className="av-inline">
            {events.length > 0 && (
              <select
                className="av-select"
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                aria-label="Choose event"
              >
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({STATUS_PILL[e.status]?.label || e.status})
                  </option>
                ))}
              </select>
            )}
            {event && <span className={`pill ${STATUS_PILL[event.status]?.cls || 'pill-gray'}`}>{STATUS_PILL[event.status]?.label || event.status}</span>}
          </div>
        </div>

        <div className="card-pad">
          <form className="av-new" onSubmit={createEvent}>
            <input
              className="av-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New event name, e.g. Annual Day — Speech Competition"
              maxLength={120}
              aria-label="New event name"
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
              <IcPlus /> Create
            </button>
          </form>
        </div>
      </div>

      {!event ? (
        <div className="card"><div className="empty-state">
          <div className="icon"><IcMic size={40} /></div>
          <h3>No events yet</h3>
          <p>Create an event above, add the speakers, then start it.</p>
        </div></div>
      ) : (
        <>
          {/* ── Audience link ────────────────────────────────────────── */}
          <div className="card av-link-card">
            <div className="card-head">
              <h3>Audience link</h3>
              <span className="av-muted">{detail?.voter_count ?? 0} joined</span>
            </div>
            <div className="card-pad av-link-body">
              {/* The QR is sized for a projector and for somebody walking up to a
                  laptop, which is why it is rendered at a fixed 120px rather than
                  scaled to the card. */}
              <div className="av-qr">
                <QRCodeSVG value={BOOTH_URL} size={120} level="M" marginSize={0} />
                <span className="av-qr-cap">Scan to rate</span>
              </div>
              <div className="av-link-side">
                <code className="av-url">{BOOTH_URL}</code>
                <p className="av-muted av-small">
                  One link for every event — whoever is on stage appears automatically. No login, no app
                  install. Voters are recorded once per speaker, by device.
                </p>
                <button className="btn btn-sm" type="button" onClick={copyLink}>
                  <IcCopy size={13} /> Copy link
                </button>
              </div>
            </div>
          </div>

          {/* ── Stage controls ──────────────────────────────────────── */}
          <div className="card">
            <div className="card-head">
              <h3>Stage</h3>
              <div className="av-inline">
                {event.status !== 'live' ? (
                  <button className="btn btn-primary btn-sm" type="button" disabled={busy || !participants.length} onClick={() => setStatus('start')}>
                    Start event
                  </button>
                ) : (
                  <button className="btn btn-sm" type="button" disabled={busy} onClick={() => setStatus('stop')}>
                    Stop
                  </button>
                )}
                {event.status !== 'completed' && (
                  <button className="btn btn-sm" type="button" disabled={busy} onClick={() => setStatus('complete')}>
                    Mark completed
                  </button>
                )}
                {event.status !== 'live' && (
                  <button className="btn btn-sm btn-danger" type="button" disabled={busy} onClick={deleteEvent}>
                    <IcTrash size={13} /> Delete
                  </button>
                )}
              </div>
            </div>

            <div className="card-pad">
              <div className="av-stage">
                <div className="av-stage-now">
                  <span className="av-stage-label">On stage now</span>
                  <strong className="av-stage-name">{current ? current.name : 'Nobody yet'}</strong>
                  {current && <span className="av-muted av-small">{current.rated ? 'Everyone has rated them' : 'Ratings coming in'}</span>}
                </div>
                <div className="av-stage-actions">
                  {/* Two next buttons, because "next speaker" genuinely means two
                      different things to somebody running a room:
                      skipRated=true  move to the next person who still needs scores,
                      skipRated=false step the queue strictly, in order. */}
                  <button className="btn btn-primary" type="button" disabled={busy || !participants.length} onClick={() => nextSpeaker('unrated')}>
                    <IcNext size={15} /> Next speaker
                  </button>
                  <button className="btn btn-sm" type="button" disabled={busy || !participants.length} onClick={() => nextSpeaker('queue')} title="Move to the next name in the queue, even if they have not been rated">
                    Queue order
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Queue ───────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-head">
              <h3>Speakers</h3>
              <span className="av-muted">{participants.length} in queue</span>
            </div>

            <div className="card-pad av-queue-pad">
              <form className="av-new" onSubmit={addSpeaker}>
                <input
                  className="av-input"
                  value={newSpeaker}
                  onChange={(e) => setNewSpeaker(e.target.value)}
                  placeholder="Add a speaker's name"
                  maxLength={120}
                  aria-label="Add speaker"
                />
                <button className="btn btn-primary" type="submit" disabled={busy || !newSpeaker.trim()}>
                  <IcPlus /> Add
                </button>
              </form>

              {participants.length === 0 ? (
                <p className="av-muted av-empty">No speakers yet. Add them above — you can reorder before you start.</p>
              ) : (
                <ul className="av-queue">
                  {participants.map((p, i) => (
                    <li key={p.id} className={`av-qitem${p.id === currentId ? ' is-current' : ''}`}>
                      <span className="av-qpos" aria-hidden="true">{i + 1}</span>
                      <div className="av-qmain">
                        <span className="av-qname">{p.name}</span>
                        <span className="av-qmeta">
                          {p.id === currentId && <span className="pill pill-green">On stage</span>}
                          <span className={`pill ${p.rated ? 'pill-blue' : 'pill-gray'}`}>
                            {p.rated ? 'Rated' : 'Not rated'}
                          </span>
                        </span>
                      </div>
                      <div className="av-qactions">
                        <button className="btn btn-sm" type="button" title="Move up" aria-label={`Move ${p.name} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                          <IcUp />
                        </button>
                        <button className="btn btn-sm" type="button" title="Move down" aria-label={`Move ${p.name} down`} disabled={busy || i === participants.length - 1} onClick={() => move(i, 1)}>
                          <IcDown />
                        </button>
                        <button className="btn btn-sm" type="button" title="Put on stage" disabled={busy} onClick={() => putOnStage(p)}>
                          <IcMic size={13} /> Stage
                        </button>
                        <button className="btn btn-sm" type="button" title="Rename" aria-label={`Rename ${p.name}`} disabled={busy} onClick={() => renameSpeaker(p)}>
                          <IcPencil />
                        </button>
                        <button className="btn btn-sm btn-danger" type="button" title="Remove" aria-label={`Remove ${p.name}`} disabled={busy} onClick={() => removeSpeaker(p)}>
                          <IcTrash />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ── Results ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-head">
              <h3>Results</h3>
              <span className="av-muted">
                {ratedCount} of {rows.length} rated · {detail?.voter_count ?? 0} joined
              </span>
            </div>

            <div className="table-wrap">
              {rows.length === 0 ? (
                <div className="empty-state"><p>No speakers to show results for.</p></div>
              ) : (
                <table className="av-table">
                  <thead>
                    <tr>
                      <th>Speaker</th>
                      {COLUMNS.map((c) => <th key={c.key} className="av-num">{c.label}</th>)}
                      <th className="av-num">Overall</th>
                      <th className="av-num">Ratings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.participant_id}>
                        <td className="av-td-name">
                          {r.name}
                          {r.participant_id === currentId && <span className="pill pill-green av-inline-pill">On stage</span>}
                        </td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className="av-num">{fmt1(r[c.key])}</td>
                        ))}
                        {/* Overall is bold because it is the number that decides
                            the ranking; the five columns are the evidence for it. */}
                        <td className="av-num av-overall">{fmt1(r.overall)}</td>
                        <td className="av-num av-count">{r.rating_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {rows.some((r) => r.rating_count > 0) && (
              <div className="av-foot">
                <p className="av-muted av-small">
                  Averages are out of 5. Time taken is scored from the audience&rsquo;s three-way choice:
                  finished early 1, on time 5, went over 3. The overall figure is the plain mean of all five.
                  Speakers with no ratings show a dash rather than a zero.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}