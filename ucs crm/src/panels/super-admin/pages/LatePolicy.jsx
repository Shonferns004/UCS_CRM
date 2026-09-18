import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/auth'

const DEFAULT_GRACE = 180

const thresholds = (grace) => {
  const g = Number(grace) || DEFAULT_GRACE
  const f = g / 180
  const half = Math.max(1, Math.round(240 * f))
  const full = Math.max(half + 1, Math.round(480 * f))
  return { grace: g, half, full }
}

export default function LatePolicy() {
  const [workers, setWorkers] = useState([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('')
  const [customOnly, setCustomOnly] = useState(false)
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState({})

  const load = () => {
    api('/workers?scope=all&status=all')
      .then((rows) => {
        setWorkers(Array.isArray(rows) ? rows : [])
        setDrafts({})
      })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  const depts = useMemo(
    () => [...new Set(workers.map((w) => w.department).filter(Boolean))].sort(),
    [workers]
  )

  const filtered = workers.filter((w) => {
    if (customOnly && (w.late_grace_minutes == null)) return false
    if (dept && (w.department || '') !== dept) return false
    if (search) {
      const s = search.toLowerCase()
      if (!`${w.name || ''} ${w.login_id || ''} ${w.employee_id || ''}`.toLowerCase().includes(s)) return false
    }
    return true
  })

  const customCount = workers.filter((w) => w.late_grace_minutes != null).length

  const setDraft = (id, val) => setDrafts((d) => ({ ...d, [id]: val }))

  const reset = async (w) => {
    setSaving((s) => ({ ...s, [w.id]: true }))
    setErr('')
    setMsg('')
    try {
      await api(`/workers/${w.id}`, {
        method: 'PUT',
        body: JSON.stringify({ late_grace_minutes: null }),
      })
      setMsg(`${w.name}: late grace reset to default (180)`)
      load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving((s) => ({ ...s, [w.id]: false }))
    }
  }

  const save = async (w) => {
    const raw = drafts[w.id]
    const val = raw === undefined || raw === '' ? null : Number(raw)
    if (val !== null && (!Number.isFinite(val) || Math.round(val) < 30 || Math.round(val) > 480)) {
      setErr('Grace must be empty (default) or 30–480 minutes')
      return
    }
    setSaving((s) => ({ ...s, [w.id]: true }))
    setErr('')
    setMsg('')
    try {
      await api(`/workers/${w.id}`, {
        method: 'PUT',
        body: JSON.stringify({ late_grace_minutes: val === null ? null : Math.round(val) }),
      })
      setMsg(`${w.name}: late grace ${val === null ? 'reset to default (180)' : `set to ${Math.round(val)} min`}`)
      load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving((s) => ({ ...s, [w.id]: false }))
    }
  }

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h3>Late Policy</h3>
        <span className="sa-muted">{customCount} custom / {workers.length} total</span>
      </div>

      <div className="sa-card" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.6 }}>
        <strong>How it works:</strong> one number per person — the free late grace (default 180 min/month).
        The half-day and full-day limits shrink or grow in the same ratio automatically.
        Example: grace <strong>100</strong> → half-day at <strong>133</strong>, full-day at <strong>267</strong>
        (and beyond that, every 267 min = 1 day). Leave empty to use the default.
      </div>

      {err && <div className="sa-err-card">{err}</div>}
      {msg && <div className="sa-card" style={{ borderColor: '#10b981', color: '#065f46', marginBottom: 12 }}>{msg}</div>}

      <div className="sa-filters">
        <input
          placeholder="Search name / login / employee id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={customOnly} onChange={(e) => setCustomOnly(e.target.checked)} />
          Custom only
        </label>
        <button className="btn btn-sm" onClick={load}>Refresh</button>
      </div>

      <div className="sa-card" style={{ overflowX: 'auto' }}>
        <table className="sa-table">
          <thead>
            <tr>
              <th>Volunteer</th>
              <th>Dept</th>
              <th>Grace (min)</th>
              <th>Half-day after</th>
              <th>Full-day after</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const current = w.late_grace_minutes ?? null
              const draft = drafts[w.id] !== undefined ? drafts[w.id] : (current === null ? '' : String(current))
              const preview = thresholds(draft === '' ? DEFAULT_GRACE : draft)
              const dirty = (draft === '' ? null : Math.round(Number(draft))) !== current
              return (
                <tr key={w.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{w.name || 'Unknown'}</div>
                    <div className="sa-muted" style={{ fontSize: 11 }}>{w.employee_id || w.login_id || ''}</div>
                  </td>
                  <td className="sa-muted">{w.department || '—'}</td>
                  <td>
                    <input
                      type="number"
                      min={30}
                      max={480}
                      placeholder={`${DEFAULT_GRACE} (default)`}
                      value={draft}
                      onChange={(e) => setDraft(w.id, e.target.value)}
                      style={{ width: 110 }}
                    />
                    {current !== null && <span className="sa-badge" style={{ marginLeft: 6 }}>custom</span>}
                  </td>
                  <td>{preview.half} min</td>
                  <td>{preview.full} min</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-sm"
                      disabled={!dirty || saving[w.id]}
                      onClick={() => save(w)}
                      style={{ background: dirty ? '#10b981' : undefined, color: dirty ? '#fff' : undefined }}
                    >
                      {saving[w.id] ? 'Saving…' : 'Save'}
                    </button>
                    {current !== null && (
                      <button
                        className="btn btn-sm"
                        style={{ marginLeft: 4 }}
                        disabled={saving[w.id]}
                        onClick={() => reset(w)}
                      >
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="sa-muted sa-center">No volunteers found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
