import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useHR } from '../store'
import { Dropdown, SkeletonRows } from './ui'
import { Trophy, Search, PartyPopper } from '../icons'
import { now, syncFrom } from '../../../lib/serverClock'

// The booth is a separate Vite app served by the same Express origin, so an
// absolute path is correct in production and in dev (the HR panel is proxied
// through the same host in every deployment this repo documents).
const BOOTH_PATH = '/voting'

// One accent per ceremony position, matching the booth so the board HR watches
// and the screen the room watches use the same colour for the same department.
const ACCENTS = ['#B8862B', '#2E7D8F', '#6B4E9B', '#B5543A', '#3E7D5A', '#3A5F8F']

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

function mmSs(total) {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// The HR panel has no generic alert component, so the three banners this page
// needs live here. Same palette the panel already uses for warn/ok states.
const NOTE_TONES = {
  info: { bg: 'var(--sage-soft)', border: 'var(--sage)', icon: 'i' },
  warn: { bg: '#fdf6e3', border: 'var(--gold)', icon: '!' },
  error: { bg: '#fdf0ee', border: 'var(--danger)', icon: '!' },
}

function Note({ tone = 'info', children, action }) {
  const t = NOTE_TONES[tone] || NOTE_TONES.info
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: t.bg, border: `1px solid ${t.border}`, borderLeftWidth: 3,
        borderRadius: 'var(--radius-sm)', padding: '9px 12px', marginBottom: 14, fontSize: 13,
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0, width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: t.border, color: '#fff', fontSize: 11, fontWeight: 800,
        }}
      >
        {t.icon}
      </span>
      <span style={{ flex: 1, minWidth: 180 }}>{children}</span>
      {action}
    </div>
  )
}

function Hint({ children }) {
  return <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{children}</p>
}

function StatusPill({ status }) {
  const map = {
    open: ['badge-present', 'Voting now'],
    expired: ['badge-pending2', 'Time up'],
    closed: ['badge-late', 'Closed'],
    pending: ['badge-pending', 'Waiting'],
    draft: ['badge-pending', 'Not started'],
    live: ['badge-present', 'Live'],
    completed: ['badge-late', 'Finished'],
  };
  const [cls, label] = map[status] || ['badge-pending', status]
  return <span className={`badge ${cls}`}>{label}</span>
}

// ── department / member editor ────────────────────────────────────────────

function MemberModal({ dept, onClose, onSave }) {
  const { fetchVotingDepartment, searchVotingWorkers, saveVotingMembers } = useHR()
  const [include, setInclude] = useState([])
  const [exclude, setExclude] = useState([])
  const [roster, setRoster] = useState([])
  const [results, setResults] = useState([])
  const [term, setTerm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetchVotingDepartment(dept.id)
      .then((d) => {
        if (!alive) return
        setRoster(d.roster || [])
        setResults(d.overrides || [])
        setInclude((d.overrides || []).filter((o) => !o.is_excluded).map((o) => String(o.worker_id)))
        setExclude((d.overrides || []).filter((o) => o.is_excluded).map((o) => String(o.worker_id)))
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [dept.id, fetchVotingDepartment])

  // Debounced so typing a name does not fire a query per keystroke.
  useEffect(() => {
    let alive = true
    const id = setTimeout(() => {
      searchVotingWorkers(term)
        .then((d) => alive && setResults(d.workers || []))
        .catch(() => {})
    }, 250)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [term, searchVotingWorkers])

  const byId = useMemo(() => {
    const m = new Map()
    roster.forEach((w) => m.set(String(w.id), w))
    include.forEach((id) => {
      if (!m.has(id)) m.set(id, { id, name: '(not in this group)', login_id: '' })
    })
    return m
  }, [roster, include])

  function toggle(id, list, setList, other) {
    const k = String(id)
    setList(list.filter((x) => String(x) !== k))
    setOther(other.filter((x) => String(x) !== k))
    if (list.some((x) => String(x) === k)) return
    setList([...list, k])
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await saveVotingMembers(dept.id, { include, exclude })
      onSave()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <h3>{dept.name} — who is in this group?</h3>
          <button className="btn btn-icon" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          {error && <Note tone="error">{error}</Note>}

          <Note tone="info">
            Tick the people in <strong>{dept.name}</strong>. This overrides the automatic match, so a
            group can be built even when it has no matching department value (that is how <em>Developers</em>{' '}
            is defined — those people sit in Digital). Unticking everyone returns the group to matching
            <code> workers.department</code> automatically.
          </Note>

          {include.length > 0 && (
            <>
              <div className="detail-label" style={{ marginBottom: 6 }}>In this group ({include.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {include.map((id) => (
                  <button
                    key={id}
                    className="pill pill-green"
                    style={{ cursor: 'pointer', border: 'none' }}
                    onClick={() => toggle(id, include, setInclude, exclude)}
                    title="Remove from this group"
                  >
                    {byId.get(id)?.name || id} &times;
                  </button>
                ))}
              </div>
            </>
          )}

          {exclude.length > 0 && (
            <>
              <div className="detail-label" style={{ marginBottom: 6 }}>Excluded from this group ({exclude.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {exclude.map((id) => (
                  <button
                    key={id}
                    className="pill pill-clay"
                    style={{ cursor: 'pointer', border: 'none' }}
                    onClick={() => toggle(id, exclude, setExclude, include)}
                    title="Put back into this group"
                  >
                    {byId.get(id)?.name || id} &times;
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search width={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-soft)' }} />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by name, login ID, employee ID or department…"
              style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 10px 9px 32px', fontSize: 13, outline: 'none' }}
            />
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            {results.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>No people match “{term}”.</div>
            ) : (
              results.map((w) => {
                const k = String(w.id)
                const on = include.includes(k)
                const off = exclude.includes(k)
                return (
                  <label
                    key={k}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px',
                      borderBottom: '1px solid var(--line)', cursor: 'pointer',
                      background: on ? 'var(--sage-soft)' : off ? '#fdf3f0' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(k, include, setInclude, exclude)}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{w.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                        {[w.login_id, w.employee_id, w.department].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {off && <span className="pill pill-clay">excluded</span>}
                    {on && <span className="pill pill-green">included</span>}
                  </label>
                )
              })
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── result bar for one department ─────────────────────────────────────────

function DeptCard({ dept, index, onClose, busy }) {
  const accent = ACCENTS[index % ACCENTS.length]
  const top = dept.results.reduce((m, r) => Math.max(m, r.votes || 0), 0)
  const [nowTick, setNowTick] = useState(() => Date.now())

  // Only the open turn needs a ticking clock; the rest of the card is static.
  useEffect(() => {
    if (dept.turn_status !== 'open') return undefined
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [dept.turn_status])

  const left =
    dept.turn_status === 'open' && dept.closes_at
      ? Math.max(0, Math.round((new Date(dept.closes_at).getTime() - nowTick) / 1000))
      : null

  const isOpen = dept.turn_status === 'open'
  // `candidates` is how many names are on this ballot; `eligible` is everyone in
  // the company, because they can all vote here.
  const candidates = dept.candidates ?? dept.eligible
  // The teams a voter picks one person from each in. A single-team department
  // has one, and is shown as it always was rather than as a per-team list.
  const teams = dept.teams || []
  const teamWinners = teams.filter((t) => t.winner)

  return (
    <div
      className="card"
      style={{
        borderTop: `3px solid ${accent}`,
        opacity: candidates === 0 ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <span
          style={{
            width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: accent, color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{dept.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
            {candidates} {candidates === 1 ? 'person' : 'people'} on the ballot
          </div>
        </div>
        <StatusPill status={dept.turn_status} />
      </div>

      {isOpen && (
        <div style={{ textAlign: 'center', padding: '10px 0 12px', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 28, color: left <= 30 ? 'var(--danger)' : 'inherit' }}>
            {mmSs(left)}
          </div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)' }}>
            left to vote
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{dept.votes_cast}</span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
          of {dept.eligible} voted
        </span>
      </div>

      {dept.results.length > 0 && (
        <div style={{ display: 'grid', gap: 7, marginBottom: 12 }}>
          {dept.results.slice(0, 5).map((r) => (
            <div key={r.nominee_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ fontWeight: r.votes === top ? 700 : 400 }}>
                  {r.name}
                  {/* One pick per team, so a nominee's count is only comparable
                      with others from the same team. Naming the team keeps the
                      bar from reading as a department-wide ranking. */}
                  {teams.length > 1 && r.team ? (
                    <span style={{ color: 'var(--ink-soft)' }}> · {r.team}</span>
                  ) : null}
                </span>
                <span style={{ color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' }}>{r.votes}</span>
              </div>
              <div style={{ height: 7, background: 'var(--sand)', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${top ? Math.round((r.votes / top) * 100) : 0}%`,
                    height: '100%',
                    background: r.votes === top ? accent : 'var(--ink-soft)',
                    borderRadius: 4,
                    // Bars grow in so the reveal reads as a reveal, not a table dump.
                    transition: 'width 0.6s cubic-bezier(0.2, 0.8, 0.3, 1)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {dept.winner && dept.turn_status === 'closed' && (
        <div
          style={{
            padding: '12px 10px',
            borderRadius: 10,
            background: `linear-gradient(135deg, ${accent}22, ${accent}0d)`,
            border: `1px solid ${accent}55`,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-soft)' }}>
            {dept.is_tie ? `${dept.tied_count}-way tie` : 'Winner'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3 }}>{dept.winner.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{dept.winner.votes} votes</div>
        </div>
      )}

      {dept.is_tie && dept.turn_status === 'closed' && (
        <Note tone="warn">
          {dept.tied_count} people are tied. HR decides the award, or run a second round.
        </Note>
      )}

      {dept.turn_status === 'closed' && teamWinners.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: 'var(--ink-soft)', marginBottom: 6,
            }}
          >
            Winners by team
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {teamWinners.map((t) => (
              <div
                key={t.key || 'no-team'}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  gap: 10, fontSize: 12.5, paddingTop: 6, borderTop: '1px solid var(--line)',
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>{t.label} · </span>
                  <span style={{ fontWeight: 700 }}>{t.winner.name}</span>
                </span>
                <span style={{ color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {t.winner.votes}
                  {t.is_tie ? ` (${t.tied_count}-way tie)` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dept.turn_status === 'pending' && dept.candidates === 0 && (
        <Note tone="warn">Nobody is on this ballot, so nobody can win it. Add people or close it.</Note>
      )}
      {isOpen && dept.candidates === 0 && (
        <Note tone="warn">This ballot is open but empty — nobody can win it.</Note>
      )}
      {isOpen && (
        <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => onClose(dept)} disabled={busy}>
          Close this ballot now
        </button>
      )}
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────

export default function Awards() {
  const {
    fetchVotingDepartments, saveVotingDepartment, fetchVotingSessions, createVotingSession,
    fetchVotingBoard, startVotingSession, closeVotingTurn, completeVotingSession,
  } = useHR()

  const [departments, setDepartments] = useState([])
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    title: 'Monthly Award Ceremony',
    tagline: 'Recognising the people who made the difference this month.',
    award_label: 'Star of the Department',
    turn_minutes: 5,
    allow_self_vote: false,
  })

  const loadDepartments = useCallback(() => {
    return fetchVotingDepartments()
      .then((d) => setDepartments(d.departments || []))
      .catch((e) => setError(e.message))
  }, [fetchVotingDepartments])

  // Picks up a ceremony that is already draft or live, so closing the tab mid-event
  // does not lose HR's place.
  const loadSessions = useCallback(() => {
    return fetchVotingSessions()
      .then((d) => {
        const rows = d.sessions || []
        setSessions(rows)
        setSessionId((cur) => {
          if (cur && rows.some((s) => s.id === cur)) return cur
          const active = rows.find((s) => s.status === 'live') || rows.find((s) => s.status === 'draft')
          return active ? active.id : rows[0]?.id ?? null
        })
      })
      .catch((e) => setError(e.message))
  }, [fetchVotingSessions])

  const loadBoard = useCallback(
    (id) => {
      if (!id) {
        setBoard(null)
        return Promise.resolve()
      }
      return fetchVotingBoard(id)
        .then((d) => {
          syncFrom(d)
          setBoard(d)
        })
        .catch((e) => setError(e.message))
    },
    [fetchVotingBoard],
  )

  useEffect(() => {
    setLoading(true)
    Promise.all([loadDepartments(), loadSessions()]).finally(() => setLoading(false))
  }, [loadDepartments, loadSessions])

  useEffect(() => {
    loadBoard(sessionId)
  }, [sessionId, loadBoard])

  // The live board is the screen HR stares at for the whole event, so it
  // refreshes on a timer as well as on any action taken from this page.
  useEffect(() => {
    if (!sessionId) return undefined
    const live = board?.session?.status === 'live'
    const id = setInterval(() => loadBoard(sessionId), live ? 4000 : 12000)
    return () => clearInterval(id)
  }, [sessionId, board?.session?.status, loadBoard])

  const session = board?.session
  const live = session?.status === 'live'

  const openUp = board?.departments.find((d) => d.turn_status === 'open') || null
  const closedCount = board?.departments.filter((d) => d.turn_status === 'closed').length || 0
  const totalVotes = board?.departments.reduce((s, d) => s + (d.votes_cast || 0), 0) || 0
  const emptyGroups = board?.departments.filter((d) => (d.candidates ?? d.eligible) === 0) || []

  async function act(key, fn) {
    setBusy(key)
    setError('')
    try {
      await fn()
      await Promise.all([loadDepartments(), loadSessions(), loadBoard(sessionId)])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  function startCeremony() {
    if (!form.title.trim()) {
      setError('Give the ceremony a title first')
      return
    }
    if (!departments.length) {
      setError('No voting departments are configured')
      return
    }
    act('start', async () => {
      // A draft already exists for this evening — reuse it so the department
      // list and any edits made since are preserved.
      const draft = sessions.find((s) => s.status === 'draft')
      const id = draft ? draft.id : (await createVotingSession(form)).session.id
      setSessionId(id)
      // Opens every department's ballot at once, on one shared timer.
      await startVotingSession(id, form.turn_minutes)
    })
  }

  function exportExcel() {
    if (!board) return
    const rows = []
    for (const d of board.departments) {
      if (!d.results.length) {
        rows.push({
          Department: d.name,
          Team: '',
          'Employee ID': '',
          Nominee: '(no votes)',
          Votes: 0,
          'Eligible voters': d.eligible,
          'Ballots cast': d.votes_cast,
          Status: d.turn_status,
        })
        continue
      }
      for (const r of d.results) {
        rows.push({
          Department: d.name,
          // Votes are counted within a team, so the team is what a row's count
          // is comparable against - it cannot be left out of the export.
          // An empty team means this row came from the single-group fallback, so
          // the department is the honest label. A literal "No team" here would be
          // a team that does not exist on the ballot HR is looking at.
          Team: r.team || d.name,
          'Employee ID': r.employee_id || '',
          Nominee: r.name,
          Votes: r.votes,
          'Eligible voters': d.eligible,
          'Ballots cast': d.votes_cast,
          Status: d.turn_status,
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, `${(session?.title || 'award-ceremony').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx`)
  }

  return (
    <div>
      {error && (
        <Note tone="error" action={<button className="btn btn-sm" onClick={() => setError('')}>Dismiss</button>}>
          {error}
        </Note>
      )}

      {/* Where the employees go. */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <PartyPopper size={20} />
            <strong>Employee voting link</strong>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Staff open <code>{BOOTH_PATH}</code> on their phone to sign in and vote. The award ceremony
            intro plays there for everyone when a turn opens.
          </div>
        </div>
        <a className="btn btn-primary" href={BOOTH_PATH} target="_blank" rel="noopener noreferrer">
          Open the voting booth
        </a>
      </div>

      {/* ── running order ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Departments in order</h3>
          <button className="btn btn-sm" onClick={loadDepartments} disabled={loading}>Refresh</button>
        </div>

        {loading ? (
          <SkeletonRows rows={6} widths={[40, 180, 90, 90, 90]} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Department</th>
                  <th>Matches</th>
                  <th>On the ballot</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d, i) => (
                  <tr key={d.id}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{d.name}</strong>
                    </td>
                    <td className="ink-soft">
                      {d.is_locked
                        ? 'Chosen by hand'
                        : d.match_department
                          ? `Department = ${d.match_department}`
                          : <span className="badge badge-absent">not set</span>}
                    </td>
                    <td>
                      <span className={`badge ${d.member_count ? 'badge-present' : 'badge-absent'}`}>
                        {d.member_count}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setEditing(d)}>
                        Edit members
                      </button>
                    </td>
                  </tr>
                ))}
                {departments.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">No departments configured yet.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Hint>
          Groups match <code>workers.department</code> automatically unless you choose them by hand.
          <strong> Developers</strong> is chosen by hand because those people sit in Digital — check all
          three are on the list so nobody ends up in two groups.
        </Hint>
      </div>

      {/* ── setup / start ──────────────────────────────────────────────── */}
      {!live && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>{sessions.find((s) => s.id === sessionId)?.status === 'draft' ? 'Ceremony setup' : 'Set up the ceremony'}</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="field">
              <span>Ceremony title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Award name</span>
              <input value={form.award_label} onChange={(e) => setForm({ ...form, award_label: e.target.value })} />
            </label>
          </div>

          <label className="field">
            <span>Tagline (optional — shown on the intro)</span>
            <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </label>

          <div className="form-row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label className="field" style={{ marginBottom: 0, maxWidth: 200 }}>
              <span>Minutes per department</span>
              <input
                type="number"
                min="1"
                max="120"
                value={form.turn_minutes}
                onChange={(e) => setForm({ ...form, turn_minutes: Number(e.target.value) || 5 })}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.allow_self_vote}
                onChange={(e) => setForm({ ...form, allow_self_vote: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              Allow people to vote for themselves
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={startCeremony} disabled={busy === 'start' || !departments.length}>
              {busy === 'start' ? 'Starting…' : `Start the ceremony — ${departments[0]?.name || 'first department'} votes first`}
            </button>
          </div>

          <Hint>
            Starting opens the first department&rsquo;s turn straight away. From then on each turn is opened
            by hand so you control the pace in the room.
          </Hint>
        </div>
      )}

      {/* ── the board ──────────────────────────────────────────────────── */}
      {session && board && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Ceremony</div>
              <div className="stat-value" style={{ fontSize: 15 }}>{session.title}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Departments done</div>
              <div className="stat-value">{closedCount} / {board.departments.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Ballots cast</div>
              <div className="stat-value">{totalVotes}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Status</div>
              <div className="stat-value" style={{ fontSize: 15 }}><StatusPill status={session.status} /></div>
            </div>
          </div>

          {emptyGroups.length > 0 && (
            <Note tone="warn">
              <strong>No one is on the ballot for:</strong> {emptyGroups.map((d) => d.name).join(', ')}.
              Add people to those departments, or close them from their card — otherwise nobody can win them.
            </Note>
          )}

          {openUp && live && (
            <Note tone="info">
              <strong>Every department is open.</strong> {totalVotes} ballots in so far, and everybody can
              vote in all {board.departments.length} of them. Voting closes at {fmtTime(openUp.closes_at)} —
              or press Finish the ceremony whenever you are ready.
            </Note>
          )}

          {!live && session.status !== 'completed' && (
            <Note tone="info">
              Voting has not started. When you press start, every department&rsquo;s ballot opens at once and
              stays open for {session.turn_minutes} minutes.
            </Note>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 14 }}>
            {board.departments.map((d, i) => (
              <DeptCard
                key={d.id}
                dept={d}
                index={i}
                busy={!!busy}
                onClose={(x) => act('close', () => closeVotingTurn(session.id, x.id))}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn" onClick={exportExcel} disabled={!totalVotes}>
              Export results to Excel
            </button>
            {live && (
              <button
                className="btn btn-primary"
                onClick={() => act('complete', () => completeVotingSession(session.id))}
                disabled={busy === 'complete'}
              >
                {busy === 'complete' ? 'Finishing…' : 'Finish the ceremony'}
              </button>
            )}
          </div>

          {session.status === 'completed' && (
            <Hint>
              Finished at {fmtTime(session.completed_at)}. The winners are now showing on the booths.
              Export the results above, or start a new ceremony for the next month.
            </Hint>
          )}

          {sessions.length > 1 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head"><h3>Past ceremonies</h3></div>
              <div className="form-row" style={{ maxWidth: 380 }}>
                <Dropdown
                  value={String(sessionId ?? '')}
                  onChange={(e) => setSessionId(Number(e.target.value))}
                  options={sessions.map((s) => ({ value: String(s.id), label: `${s.title} — ${s.status}` }))}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── previous ceremonies, before anything is set up ─────────────── */}
      {!session && !loading && sessions.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Past ceremonies</h3></div>
          <div className="form-row" style={{ maxWidth: 380 }}>
            <Dropdown
              value={String(sessionId ?? '')}
              onChange={(e) => setSessionId(Number(e.target.value))}
              options={sessions.map((s) => ({ value: String(s.id), label: `${s.title} — ${s.status}` }))}
            />
          </div>
        </div>
      )}

      {editing && <MemberModal dept={editing} onClose={() => setEditing(null)} onSave={loadDepartments} />}
    </div>
  )
}
