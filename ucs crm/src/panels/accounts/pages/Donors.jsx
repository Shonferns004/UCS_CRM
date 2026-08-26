import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/auth'

const currency = (n) => {
  if (n == null || isNaN(n)) return '\u20B90'
  return '\u20B9' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const SkeletonNum = ({ w = 48 }) => (
  <span className="sk-num" style={{ display: 'inline-block', width: w, height: 24, borderRadius: 6, background: 'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} />
)

const SkeletonRow = ({ cols }) => (
  <tr>{Array.from({ length: cols }, (_, i) => <td key={i}><span className="sk-num" style={{ display: 'inline-block', width: i === 0 ? 140 : i === 1 ? 110 : i === 2 ? 90 : i === 3 ? 80 : i === 4 ? 60 : 90, height: 14, borderRadius: 4, background: 'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)', backgroundSize: '200% 100%', animation: 'sk-shimmer 1.4s infinite' }} /></td>)}</tr>
)

const StatCard = ({ icon, label, value, color, loading: l }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: color + '18', color }}>{icon}</div>
    <div className="stat-info">
      {l ? <SkeletonNum w={72} /> : <div className="stat-num">{value}</div>}
      <div className="stat-lbl">{label}</div>
    </div>
  </div>
)

const DONOR_FIELDS = [
  ['name', 'Full Name'], ['mobile_number', 'Mobile Number'], ['mobile_2', 'Mobile 2'], ['email', 'Email'],
  ['address_1', 'Address Line 1'], ['address_2', 'Address Line 2'],
  ['pan_number', 'PAN Card'],
]

const fieldVal = (d, key) => {
  const v = d?.[key]
  if (v == null) return ''
  return String(v).slice(0, 10)
}

const inputStyle = { width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13, color: 'var(--ink)', background: '#fff', boxSizing: 'border-box' }

function DonorDetail({ donorId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const loadDetail = useCallback((id) => {
    setLoading(true)
    apiGet('/accounts/donors/' + id)
      .then(r => setData(r))
      .catch(e => console.error('Error:', e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadDetail(donorId) }, [donorId, loadDetail])

  const startEdit = () => {
    if (!data?.donor) return
    const f = {}
    for (const [key] of DONOR_FIELDS) f[key] = fieldVal(data.donor, key)
    setForm(f)
    setSaveErr('')
    setEditing(true)
  }

  const cancelEdit = () => { setEditing(false); setSaveErr('') }

  const saveEdit = async () => {
    if (!data?.donor || saving) return
    const changes = {}
    for (const [key] of DONOR_FIELDS) {
      if ((form[key] || '') !== fieldVal(data.donor, key)) changes[key] = form[key]
    }
    if (Object.keys(changes).length === 0) { setEditing(false); return }
    setSaving(true)
    setSaveErr('')
    try {
      await apiPatch('/accounts/donors/' + donorId, changes)
      setEditing(false)
      loadDetail(donorId)
      if (onChanged) onChanged()
    } catch (e) {
      setSaveErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: '90%', padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <SkeletonNum w={44} /><div style={{ flex: 1 }}><SkeletonNum w={160} /><div style={{ marginTop: 6 }}><SkeletonNum w={100} /></div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {Array.from({ length: 4 }, (_, i) => <div key={i}><SkeletonNum w={60} /><div style={{ marginTop: 6 }}><SkeletonNum w={100} /></div></div>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 4 }, (_, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}><SkeletonNum w={8} /><div style={{ flex: 1 }}><SkeletonNum w={i % 2 === 0 ? 180 : 140} /></div><SkeletonNum w={70} /></div>)}
        </div>
      </div>
    </div>
  )

  if (!data || !data.donor) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: '90%', padding: 40, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }} onClick={e => e.stopPropagation()}>
        Failed to load donor details
      </div>
    </div>
  )

  const d = data.donor
  const receipts = data.receipts || []
  const initial = (d.name || d.bank_donor_name || d.agent_donor_name || '?')[0].toUpperCase()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="stat-icon" style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{initial}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{d.name || d.bank_donor_name || d.agent_donor_name || 'Donor'}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 1 }}>{d.mobile_number || ''} &middot; <strong>{data.receiptCount}</strong> receipt{data.receiptCount !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!editing && <button className="btn btn-sm btn-primary" onClick={startEdit}>Edit</button>}
            <button onClick={onClose} className="btn btn-icon" title="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14, background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div><div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>First Donation</div><div style={{ fontSize: 12, color: 'var(--ink)' }}>{d.first_donation_date ? new Date(d.first_donation_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>Last Donation</div><div style={{ fontSize: 12, color: 'var(--ink)' }}>{d.last_donation_date ? new Date(d.last_donation_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>Lifetime Total</div><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sage)' }}>{currency(d.total_amount)}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>Donations</div><div style={{ fontSize: 12, color: 'var(--ink)' }}>{data.receiptCount}</div></div>
          </div>

          {!editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              {DONOR_FIELDS.map(([key, label]) => {
                const v = fieldVal(data.donor, key)
                return (
                  <div key={key} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</div>
                    <div style={{ fontSize: 13, color: v ? 'var(--ink)' : 'var(--ink-soft)', fontFamily: key === 'pan_number' || key.startsWith('mobile') ? 'monospace' : undefined, wordBreak: 'break-word' }}>
                      {v || '\u2014'}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); saveEdit() }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px' }}>
                {DONOR_FIELDS.map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</span>
                    <input
                      type="text"
                      value={form[key] ?? ''}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>
              {saveErr && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>Save failed: {saveErr}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 6 }}>
                <button type="button" className="btn btn-sm" onClick={cancelEdit} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          )}

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .5, margin: '14px 0 10px' }}>Receipts</div>
          {receipts.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', padding: 24, margin: 0 }}>No receipts found</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {receipts.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < receipts.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-soft)', flexShrink: 0, opacity: .4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--ink)' }}>{r.receipt_no}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{r.mode || ''}{r.project_id ? ` \u00B7 ${r.project_id}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sage)', whiteSpace: 'nowrap' }}>{currency(r.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Total donations</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--sage)' }}>{currency(data.totalAmount)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>({data.receiptCount})</span></span>
        </div>
      </div>
    </div>
  )
}

const parseAssignments = (d, ngoFilter = '') => {
  if (Array.isArray(d.assignment_list)) return d.assignment_list
  if (!d.assigned_to) return []
  const parsed = String(d.assigned_to).split(/\s*,\s*/).map(s => {
    const m = s.match(/^(.+?)\s*\(([^)]*)\)(?:\s*—\s*(.*))?$/)
    if (m) return { name: m[1].trim(), station: m[2].trim(), ngo: (m[3] || '').trim() }
    const clean = s.replace(/\s*—\s*.*$/, '').trim()
    return { name: clean, station: '', ngo: '' }
  }).filter(a => a.name)
  if (!ngoFilter) return parsed
  return parsed.filter(a => a.ngo && a.ngo.toLowerCase().includes(ngoFilter.toLowerCase()))
}

const hasBlankStationEntry = (d) =>
  Array.isArray(d.assignment_list) &&
  d.assignment_list.some(a => a.id && a.name && !(a.station && String(a.station).trim() !== ''))

// Mini modal to manage an orphaned donor's agent-assignments: set the missing
// station, swap in a different agent, or delete the assignment outright.
// Station choices come from the real registry so saved strings always match
// queue matching exactly; agents are active FROs from /receipts/fro-workers.
function SetStationModal({ donor, ngoOptions, onClose, onSaved }) {
  const [entries, setEntries] = useState(() =>
    (Array.isArray(donor.assignment_list) ? donor.assignment_list : [])
      .filter(a => a.id && a.name && !(a.station && String(a.station).trim() !== ''))
  )
  const [agents, setAgents] = useState([])
  const [stationOpts, setStationOpts] = useState([])
  const [picks, setPicks] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    apiGet('/accounts/stations-options')
      .then(r => setStationOpts(r.options || []))
      .catch(e => setErr(e.message))
    apiGet('/accounts/receipts/fro-workers')
      .then(r => setAgents(Array.isArray(r) ? r : []))
      .catch(() => {})
  }, [])

  const ngoNameOf = (id) => (ngoOptions.find(n => n.id === id) || {}).name || ''
  // Station choices scoped to the assignment's own NGO first; fall back to the
  // full registry when that NGO has no registered stations yet.
  const optionsFor = (entry) => {
    const own = stationOpts.filter(o => o.ngo_id === entry.ngo_id)
    return own.length > 0 ? own : stationOpts
  }

  const pickOf = (e) => picks[e.id] || { worker_id: '', station: '' }
  const setPick = (id, patch) => setPicks(p => ({ ...p, [id]: { ...(p[id] || { worker_id: '', station: '' }), ...patch } }))
  const changedEntries = () => entries.filter(e => {
    const p = pickOf(e)
    return (p.worker_id && p.worker_id !== e.worker_id) || p.station
  })

  const save = async () => {
    const targets = changedEntries()
    if (targets.length === 0) { setErr('Change an agent or pick a station first'); return }
    for (const t of targets) if (!pickOf(t).station) { setErr('Pick a station for every row you are saving'); return }
    setSaving(true); setErr('')
    try {
      for (const t of targets) {
        const p = pickOf(t)
        await apiPatch(`/accounts/donors/${donor.id}/assignments/${t.id}/replace`, {
          fro_worker_id: p.worker_id || t.worker_id,
          station: p.station,
        })
      }
      onSaved()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const removeAssignment = async (entry) => {
    if (!confirm(`Remove ${entry.name}${ngoNameOf(entry.ngo_id) ? ` (${ngoNameOf(entry.ngo_id)})` : ''} from this donor? The agent loses this lead and its history.`)) return
    setBusyId(entry.id); setErr('')
    try {
      await apiDelete(`/accounts/donors/${donor.id}/assignments/${entry.id}`)
      const left = entries.filter(e => e.id !== entry.id)
      setEntries(left)
      if (left.length === 0) onSaved()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: '94%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15 }}>Manage Assignment — {donor.name || 'Donor'}</h3>
          <button onClick={onClose} className="btn btn-icon" title="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 14px' }}>
            These assignments have no station. Set one, swap the agent, or remove the assignment entirely.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map(e => (
              <div key={e.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', position: 'relative' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8 }}>
                  {ngoNameOf(e.ngo_id) || 'NGO'} · currently: <strong style={{ color: 'var(--ink)' }}>{e.name}</strong>
                  <button
                    onClick={() => removeAssignment(e)}
                    disabled={busyId === e.id}
                    title="Delete assignment — frees the donor completely"
                    style={{ position: 'absolute', top: 8, right: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '3px 7px', fontSize: 11, cursor: busyId === e.id ? 'wait' : 'pointer' }}
                  >
                    {busyId === e.id ? '...' : '🗑 Remove'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={pickOf(e).worker_id}
                    onChange={ev => setPick(e.id, { worker_id: ev.target.value })}
                    style={{ flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13, background: '#fff' }}
                    title="Agent"
                  >
                    {(e.worker_id && !agents.some(a => String(a.id) === String(e.worker_id))
                      ? [{ id: e.worker_id, name: `${e.name} (current)` }]
                      : []
                    ).concat(agents).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <select
                    value={pickOf(e).station}
                    onChange={ev => setPick(e.id, { station: ev.target.value })}
                    style={{ flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13, background: '#fff' }}
                    title="Station"
                  >
                    <option value="">— pick station —</option>
                    {optionsFor(e).map(o => <option key={o.ngo_id + '|' + o.station} value={o.station}>{o.station}</option>)}
                  </select>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center', padding: '20px 0' }}>
                All assignments resolved. Reloading…
              </div>
            )}
          </div>
          {err && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 12 }}>{err}</div>}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Donors() {
  const [donors, setDonors] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [ngoFilter, setNgoFilter] = useState('')
  const [ngoOptions, setNgoOptions] = useState([])
  const [restoring, setRestoring] = useState(false)
  const [missingOnly, setMissingOnly] = useState(false)
  const [stationDonor, setStationDonor] = useState(null)
  const limit = 100

  useEffect(() => {
    apiGet('/accounts/ngos').then(res => setNgoOptions(Array.isArray(res) ? res : [])).catch(() => {})
  }, [])

  const load = useCallback(async (q, pg, ngo, ms) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      if (ngo) params.set('ngo', ngo)
      if (ms) params.set('missing_station', 'true')
      params.set('limit', String(limit))
      params.set('page', String(pg))
      const res = await apiGet('/accounts/donors?' + params.toString())
      setDonors(res.data || [])
      setTotal(res.total || 0)
    } catch (err) { console.error('Error:', err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(search, page, ngoFilter, missingOnly) }, [load, search, page, ngoFilter, missingOnly])

  const stats = useMemo(() => {
    let amount = 0, count = 0
    for (const d of donors) {
      amount += parseFloat(d.total_amount || 0)
      count += d.donation_count || 0
    }
    return { amount, count }
  }, [donors])

  const totalPages = Math.ceil(total / limit)

  const handleSearch = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleNgoChange = (name) => {
    setNgoFilter(name)
    setPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const res = await apiGet('/accounts/donors/export?' + params.toString())
      const rows = res.data || []
      if (rows.length === 0) {
        alert('No donors to export.')
        return
      }
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Donors')
      XLSX.writeFile(wb, `donors_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      console.error('Export error:', err.message)
      alert('Export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleRestoreWrong = async () => {
    if (!window.confirm('This will remove donors who were manually assigned to FROs they don\'t belong to (no station). Continue?')) return
    setRestoring(true)
    try {
      const res = await apiPost('/accounts/donors/restore-wrong-assignments')
      alert(`Restored ${res?.restored || 0} wrong assignments`)
      load(search, page, ngoFilter, missingOnly)
    } catch (e) {
      alert('Failed: ' + e.message)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div>
      <div className="stats-grid">
        <StatCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} label="Total Donors" value={total} color="#5B6B4E" loading={loading} />
        <StatCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>} label="Total Donation Amount" value={currency(stats.amount)} color="#16a34a" loading={loading} />
        <StatCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 2 7 2 9 22 9 22 7 12 2"/><rect x="4" y="11" width="3" height="7"/><rect x="10.5" y="11" width="3" height="7"/><rect x="17" y="11" width="3" height="7"/></svg>} label="Total Donations" value={stats.count.toLocaleString('en-IN')} color="#e67e22" loading={loading} />
      </div>

      <div className="card">
        <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginRight: 'auto' }}>
            <button className={`btn btn-sm${ngoFilter === '' ? ' btn-primary' : ''}`} onClick={() => handleNgoChange('')}>All</button>
            {ngoOptions.map(n => (
              <button key={n.id} className={`btn btn-sm${ngoFilter === n.name ? ' btn-primary' : ''}`} onClick={() => handleNgoChange(n.name)}>{n.name}</button>
            ))}
            <button
              className={`btn btn-sm${missingOnly ? ' btn-primary' : ''}`}
              onClick={() => { setMissingOnly(v => !v); setPage(1) }}
              title="Donors whose agent is assigned but station is blank"
              style={missingOnly ? {} : { background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74' }}
            >
              Missing station
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 'auto' }}>
            <input
              className="search-input"
              placeholder="Search by name, mobile, or city..."
              value={search}
              onChange={handleSearch}
            />
            <button className="btn" onClick={handleExport} disabled={exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
            <button className="btn" onClick={handleRestoreWrong} disabled={restoring} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, background: restoring ? '#e5e7eb' : '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>
              {restoring ? 'Restoring...' : 'Restore Wrong Assignments'}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="donors-table">
            <thead>
              <tr>
                <th>Donor</th>
                <th>Mobile</th>
                <th>Assigned To</th>
                <th>Station</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} cols={4} />)
              ) : donors.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No donors found</td></tr>
              ) : donors.map(d => {
                const initial = (d.name || d.bank_donor_name || d.agent_donor_name || '?')[0].toUpperCase()
                const assignments = parseAssignments(d, ngoFilter)
                return (
                  <tr key={d.id} className="clickable-row" onClick={() => setSelectedId(d.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initial}</div>
                        <strong>{d.name || d.bank_donor_name || d.agent_donor_name || '-'}</strong>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--ink-soft)' }}>{d.mobile_number || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)', padding: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {assignments.length > 0 ? assignments.map((a, i) => (
                          <span key={i} style={{ padding: '9px 10px', borderBottom: i < assignments.length - 1 ? '1px solid var(--line)' : 'none' }}>{a.name || '—'}</span>
                        )) : <span style={{ padding: '9px 10px' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)', padding: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {assignments.length > 0 ? assignments.map((a, i) => (
                          <span key={i} style={{ padding: '9px 10px', borderBottom: i < assignments.length - 1 ? '1px solid var(--line)' : 'none' }}>{a.station || '—'}</span>
                        )) : <span style={{ padding: '9px 10px' }}>—</span>}
                        {hasBlankStationEntry(d) && (
                          <button
                            className="btn btn-sm"
                            onClick={e => { e.stopPropagation(); setStationDonor(d) }}
                            title="Assign the missing station"
                            style={{ margin: '6px 10px', fontSize: 11, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', width: 'fit-content' }}
                          >
                            ✏️ Set station
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div className="pagination">
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p
              if (totalPages <= 7) p = i + 1
              else if (page <= 4) p = i + 1
              else if (page >= totalPages - 3) p = totalPages - 6 + i
              else p = page - 3 + i
              return <button key={p} className={`btn btn-sm${p === page ? ' btn-primary' : ''}`} onClick={() => setPage(p)}>{p}</button>
            })}
            <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {selectedId && <DonorDetail donorId={selectedId} onClose={() => { setSelectedId(null) }} onChanged={() => load(search, page, ngoFilter, missingOnly)} />}

      {stationDonor && (
        <SetStationModal
          donor={stationDonor}
          ngoOptions={ngoOptions}
          onClose={() => setStationDonor(null)}
          onSaved={() => { setStationDonor(null); load(search, page, ngoFilter, missingOnly) }}
        />
      )}

      <style>{`
        .donors-table th, .donors-table td { border-right: 1px solid var(--line); }
        .donors-table th:last-child, .donors-table td:last-child { border-right: none; }
      `}</style>
    </div>
  )
}
