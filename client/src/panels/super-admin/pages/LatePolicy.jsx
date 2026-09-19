import { useState, useEffect } from 'react'
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
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState({})
  const [addedIds, setAddedIds] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const load = () => {
    api('/workers?scope=all&status=all')
      .then((rows) => {
        setWorkers(Array.isArray(rows) ? rows : [])
        setDrafts({})
      })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  // Only employees the admin picked (plus anyone already custom) are shown.
  const shown = workers.filter((w) => w.late_grace_minutes != null || addedIds.includes(w.id))

  const candidates = workers.filter((w) => {
    if (w.late_grace_minutes != null || addedIds.includes(w.id)) return false
    if (pickerSearch) {
      const s = pickerSearch.toLowerCase()
      if (!`${w.name || ''} ${w.login_id || ''} ${w.employee_id || ''}`.toLowerCase().includes(s)) return false
    }
    return true
  }).slice(0, 50)

  const setDraft = (id, val) => setDrafts((d) => ({ ...d, [id]: val }))

  const addWorker = (w) => {
    setAddedIds((ids) => (ids.includes(w.id) ? ids : [...ids, w.id]))
    setDrafts((d) => (d[w.id] === undefined ? { ...d, [w.id]: w.late_grace_minutes == null ? '' : String(w.late_grace_minutes) } : d))
  }

  const removeRow = (id) => {
    setAddedIds((ids) => ids.filter((x) => x !== id))
    setDrafts((d) => {
      const next = { ...d }
      delete next[id]
      return next
    })
  }

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
      removeRow(w.id)
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
      setErr('Grace must be 30–480 minutes')
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
      if (val === null) removeRow(w.id)
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
        <span className="sa-muted">{shown.length} selected</span>
      </div>

      <div className="sa-card" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.6 }}>
        <strong>How it works:</strong> pick an employee, set their free late grace (default 180 min/month).
        The half-day and full-day limits shrink or grow in the same ratio automatically.
        Example: grace <strong>100</strong> → half-day at <strong>133</strong>, full-day at <strong>267</strong>.
      </div>

      {err && <div className="sa-err-card">{err}</div>}
      {msg && <div className="sa-card" style={{ borderColor: '#10b981', color: '#065f46', marginBottom: 12 }}>{msg}</div>}

      <div className="sa-filters">
        <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff' }} onClick={() => { setPickerSearch(''); setPickerOpen(true) }}>
          + Add employee
        </button>
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
            {shown.map((w) => {
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
                    {current !== null ? (
                      <button
                        className="btn btn-sm"
                        style={{ marginLeft: 4 }}
                        disabled={saving[w.id]}
                        onClick={() => reset(w)}
                      >
                        Reset
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm"
                        style={{ marginLeft: 4 }}
                        onClick={() => removeRow(w.id)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={6} className="sa-muted sa-center">No employees selected — click “+ Add employee” to pick one.</td></tr>}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="sa-card"
            style={{ width: 480, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Add employee</strong>
              <button className="btn btn-sm" onClick={() => setPickerOpen(false)}>Done</button>
            </div>
            <input
              autoFocus
              placeholder="Search name / login / employee id"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ overflowY: 'auto' }}>
              {candidates.map((w) => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{w.name || 'Unknown'}</div>
                    <div className="sa-muted" style={{ fontSize: 11 }}>{w.employee_id || w.login_id || ''}{w.department ? ` · ${w.department}` : ''}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => addWorker(w)}>Add</button>
                </div>
              ))}
              {candidates.length === 0 && <div className="sa-muted sa-center" style={{ padding: 12 }}>No matches</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
