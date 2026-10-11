import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/auth';

/**
 * Per-agent WhatsApp performance, for the WhatsApp Admin surface.
 *
 * Two levels, because "who worked" and "what did they work on" are different
 * questions: the leaderboard ranks agents over the window, and selecting one
 * loads the conversations that produced those numbers. The second request is
 * lazy — the whole organisation's conversation rows are not worth fetching to
 * render a list of agents.
 *
 * No contact detail beyond name and phone is shown, and nothing is stored: this
 * screen is a read-only roll-up over messages/conversations.
 */

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const PROJECTS = [
  { value: '', label: 'All projects' },
];

const MUTED = '#6b7280';
const TEXT = '#374151';

const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

// "4m ago" / "2h ago" / "3d ago". Read relative rather than absolute because the
// window's most useful comparison is "is this person live right now", which a
// timestamp column answers badly at a glance.
function relTime(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const fmtMins = (m) => {
  if (m == null) return '—';
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem ? `${h}h ${rem}m` : `${h}h`;
};

const fmtNum = (n) => (n == null ? '0' : Number(n).toLocaleString('en-IN'));

const RANK_BG = ['#fef3c7', '#e5e7eb', '#fde4d0', '#f3f4f6'];
const RANK_FG = ['#92400e', '#4b5563', '#9a3412', '#6b7280'];

function Kpi({ label, value, sub, accent }) {
  return (
    <div
      style={{
        flex: '1 1 120px',
        minWidth: 0,
        padding: '10px 12px',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || TEXT, lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      {right}
    </div>
  );
}

const th = {
  fontSize: 10,
  fontWeight: 700,
  color: MUTED,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};

const td = {
  fontSize: 12,
  color: TEXT,
  padding: '7px 8px',
  borderBottom: '1px solid #f3f4f6',
  whiteSpace: 'nowrap',
};

const numCell = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function WhatsAppAgentPerformance() {
  const [range, setRange] = useState('today');
  const [project, setProject] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [chats, setChats] = useState(null);
  const [chatsLoading, setChatsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ range });
      if (project) qs.set('project', project);
      setData(await apiGet(`/whatsapp/performance/agents?${qs}`));
    } catch (err) {
      setError(err.message || 'Could not load agent performance');
    } finally {
      setLoading(false);
    }
  }, [range, project]);

  useEffect(() => { load(); }, [load]);

  // Changing the window invalidates the open conversation list: it belongs to a
  // range the user is no longer looking at.
  useEffect(() => { setSelected(null); setChats(null); }, [range, project]);

  const openChats = async (agent) => {
    if (selected?.worker_id === agent.worker_id) {
      setSelected(null);
      setChats(null);
      return;
    }
    setSelected(agent);
    setChatsLoading(true);
    try {
      const qs = new URLSearchParams({ range });
      if (project) qs.set('project', project);
      setChats(await apiGet(`/whatsapp/performance/agents/${agent.worker_id}/conversations?${qs}`));
    } catch (err) {
      setChats({ conversations: [], error: err.message });
    } finally {
      setChatsLoading(false);
    }
  };

  const agents = data?.agents || [];
  const t = data?.totals;
  const rangeLabel = RANGES.find((r) => r.value === range)?.label || 'Today';

  return (
    <div>
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Agent Performance</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            style={{ fontSize: 11, padding: '3px 6px' }}
            aria-label="Project"
          >
            {/* Built from what the server reports, not a hard-coded list. The
                project column is free text and the live data carries bsct, bsct2,
                mann and aflf — a list written down here would be a list that is
                silently wrong the day somebody adds a project. */}
            {PROJECTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            {(data?.projects || []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className="btn btn-sm"
                style={{
                  fontSize: 11,
                  padding: '3px 9px',
                  background: range === r.value ? '#111827' : '#fff',
                  color: range === r.value ? '#fff' : '#374151',
                  border: '1px solid ' + (range === r.value ? '#111827' : '#d1d5db'),
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="pill pill-red" style={{ padding: '6px 10px' }}>{error}</div>
      ) : loading && !data ? (
        <div style={{ padding: 12, fontSize: 13, color: MUTED }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Kpi label="Active agents" value={fmtNum(t?.agents)} sub={`${rangeLabel.toLowerCase()}`} />
            <Kpi label="Chats" value={fmtNum(t?.chats)} sub="distinct conversations" />
            <Kpi label="Messages sent" value={fmtNum(t?.messages_sent)} accent="#1d6f42" />
            <Kpi label="Replies received" value={fmtNum(t?.replies_received)} />
            <Kpi
              label="Avg first reply"
              value={fmtMins(t?.avg_first_response_mins)}
              sub="chat-weighted"
            />
            <Kpi
              label="Failed"
              value={fmtNum(t?.failed_messages)}
              sub={t?.failed_messages > 0 ? 'needs a look' : 'all delivered'}
              accent={t?.failed_messages > 0 ? '#dc2626' : TEXT}
            />
          </div>

          <SectionTitle right={<span style={{ fontSize: 10, color: MUTED }}>click a row for chats</span>}>
            Agents ({agents.length})
          </SectionTitle>

          {agents.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, color: MUTED }}>
              No agents on the roster for this filter. Assign a FRO to a WhatsApp number under “Accounts &amp; Agents”.
            </div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 34 }}>#</th>
                      <th style={th}>Agent</th>
                      <th style={{ ...th, textAlign: 'right' }}>Chats</th>
                      <th style={{ ...th, textAlign: 'right' }}>Sent</th>
                      <th style={{ ...th, textAlign: 'right' }}>Replies</th>
                      <th style={{ ...th, textAlign: 'right' }}>Avg 1st</th>
                      <th style={{ ...th, textAlign: 'right' }}>Failed</th>
                      <th style={{ ...th, textAlign: 'right' }}>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a, i) => {
                      const isOpen = selected?.worker_id === a.worker_id;
                      return (
                        <tr
                          key={a.worker_id}
                          onClick={() => openChats(a)}
                          style={{ cursor: 'pointer', background: isOpen ? '#f0fdf4' : 'transparent' }}
                        >
                          <td style={td}>
                            {i < 4 ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  minWidth: 18,
                                  textAlign: 'center',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '1px 4px',
                                  borderRadius: 4,
                                  background: RANK_BG[i],
                                  color: RANK_FG[i],
                                }}
                              >
                                {i + 1}
                              </span>
                            ) : (
                              <span style={{ color: MUTED, fontSize: 10 }}>{i + 1}</span>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span
                                style={{
                                  width: 22, height: 22, borderRadius: '50%',
                                  background: '#5B6B4E20', color: '#5B6B4E',
                                  fontSize: 9, fontWeight: 700,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {initials(a.name)}
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontWeight: 600 }}>{a.name || 'Unnamed'}</span>
                                  {a.agent_label && (
                                    <span className="pill" style={{ background: '#0d948818', color: '#0d9488', fontSize: 9, padding: '0 5px' }}>
                                      {a.agent_label}
                                    </span>
                                  )}
                                  {!a.chats && (
                                    <span className="pill" style={{ background: '#f3f4f6', color: MUTED, fontSize: 9, padding: '0 5px' }}>
                                      no activity
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: MUTED, fontFamily: 'monospace' }}>
                                  {a.login_id || '—'}
                                  {a.projects?.length ? ` · ${a.projects.join(', ')}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={numCell}>{fmtNum(a.chats)}</td>
                          <td style={numCell}>{fmtNum(a.messages_sent)}</td>
                          <td style={numCell}>{fmtNum(a.replies_received)}</td>
                          <td style={numCell}>{fmtMins(a.avg_first_response_mins)}</td>
                          <td style={{ ...numCell, color: a.failed_messages ? '#dc2626' : TEXT }}>
                            {fmtNum(a.failed_messages)}
                          </td>
                          <td style={{ ...numCell, color: MUTED }}>{relTime(a.last_activity_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selected && (
            <>
              <SectionTitle
                right={
                  <button className="btn btn-sm" onClick={() => openChats(selected)} style={{ fontSize: 10, padding: '2px 8px' }}>
                    Close
                  </button>
                }
              >
                Chats worked by {selected.name || selected.login_id}
              </SectionTitle>

              {chatsLoading ? (
                <div style={{ padding: 12, fontSize: 13, color: MUTED }}>Loading chats…</div>
              ) : chats?.error ? (
                <div className="pill pill-red" style={{ padding: '6px 10px' }}>{chats.error}</div>
              ) : !chats?.conversations?.length ? (
                <div style={{ padding: 12, fontSize: 13, color: MUTED }}>No chats in this window.</div>
              ) : (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th style={th}>Contact</th>
                          <th style={th}>Phone</th>
                          <th style={th}>Project</th>
                          <th style={th}>Status</th>
                          <th style={{ ...th, textAlign: 'right' }}>Sent</th>
                          <th style={{ ...th, textAlign: 'right' }}>Received</th>
                          <th style={th}>Last message</th>
                          <th style={{ ...th, textAlign: 'right' }}>Replied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chats.conversations.map((c) => {
                          const name = c.contact_name || c.wa_profile_name;
                          return (
                            <tr key={c.conversation_id}>
                              <td style={td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  <span
                                    style={{
                                      width: 20, height: 20, borderRadius: '50%',
                                      background: '#25D36620', color: '#1d6f42',
                                      fontSize: 9, fontWeight: 700,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {initials(name)}
                                  </span>
                                  <span style={{ fontWeight: 500 }}>{name || 'Unknown'}</span>
                                </div>
                              </td>
                              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{c.phone || '—'}</td>
                              <td style={td}>
                                <span className="pill" style={{ background: '#5B6B4E20', color: '#5B6B4E', fontSize: 9, padding: '1px 6px' }}>
                                  {c.project || '—'}
                                </span>
                              </td>
                              <td style={{ ...td, color: c.status === 'closed' ? MUTED : TEXT }}>{c.status || 'open'}</td>
                              <td style={numCell}>{fmtNum(c.sent)}</td>
                              <td style={numCell}>{fmtNum(c.received)}</td>
                              <td
                                style={{
                                  ...td,
                                  whiteSpace: 'normal',
                                  maxWidth: 260,
                                  color: MUTED,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={c.last_message}
                              >
                                {c.last_message}
                              </td>
                              <td style={{ ...numCell, color: MUTED }}>{relTime(c.last_sent_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}