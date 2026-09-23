import { useState, useEffect, useCallback, Fragment } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '../store'

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  input: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', outline: 'none', minWidth: '160px', background: 'var(--card-bg)', color: 'var(--ink)' },
  btn: { padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  card: { background: 'var(--card-bg)', boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)', border: '1px solid var(--line)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--line)', fontWeight: 600, color: 'var(--ink-soft)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'var(--bg)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--bg)', color: 'var(--ink)', verticalAlign: 'top' },
  pill: (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: bg, color: fg }),
  link: { color: 'var(--sage)', textDecoration: 'none', cursor: 'pointer', fontWeight: 500 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' },
  modal: { background: 'var(--card-bg)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', maxWidth: 640, width: '100%', padding: '20px', border: '1px solid var(--line)' },
  field: { marginBottom: '12px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—')
const fmtTime = (t) => (t ? String(t).slice(0, 5) : '—')
const fmtDateTime = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Events() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ title: '', event_date: '', start_time: '', end_time: '', location: '', state: '', description: '' })
  const [saving, setSaving] = useState(false)

  // Per-event detail: programs + marked beneficiaries
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState({})
  const [allPrograms, setAllPrograms] = useState([])
  const [attachId, setAttachId] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await apiGet('/operator/events')
      setEvents(Array.isArray(res) ? res : res?.events || [])
    } catch (e) {
      setErr(e.message || 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadPrograms = useCallback(async () => {
    try {
      const res = await apiGet('/programs?page=1&pageSize=1000')
      setAllPrograms(res?.data || [])
    } catch { setAllPrograms([]) }
  }, [])

  useEffect(() => { loadPrograms() }, [loadPrograms])

  const loadDetail = async (id) => {
    setOpenId(id === openId ? null : id)
    if (id === openId) return
    try {
      const [programs, beneficiaries] = await Promise.all([
        apiGet(`/operator/events/${id}/programs`),
        apiGet(`/operator/events/${id}/beneficiaries`),
      ])
      setDetail((prev) => ({ ...prev, [id]: { programs: Array.isArray(programs) ? programs : [], beneficiaries: Array.isArray(beneficiaries) ? beneficiaries : [] } }))
    } catch (e) {
      setErr(e.message || 'Failed to load event details')
    }
  }

  const openNew = () => { setEdit(null); setForm({ title: '', event_date: '', start_time: '', end_time: '', location: '', state: '', description: '' }); setShowForm(true) }
  const openEdit = (ev) => {
    setEdit(ev)
    setForm({ title: ev.title || '', event_date: ev.event_date ? String(ev.event_date).slice(0, 10) : '', start_time: ev.start_time || '', end_time: ev.end_time || '', location: ev.location || '', state: ev.state || '', description: ev.description || '' })
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    setErr('')
    try {
if (edit) await apiPut(`/operator/events/${edit.id}`, form)
      else await apiPost('/operator/events', form)
      setShowForm(false)
      await load()
    } catch (e) {
      setErr(e.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this event (and its program links)?')) return
    try {
      await apiDelete(`/operator/events/${id}`)
      setDetail((prev) => { const n = { ...prev }; delete n[id]; return n })
      setOpenId(null)
      await load()
    } catch (e) {
      setErr(e.message || 'Failed to delete event')
    }
  }

  const attachProgram = async (evId) => {
    if (!attachId) return
    setBusy(`attach-${evId}`)
    setErr('')
    try {
      const res = await apiPost(`/operator/events/${evId}/programs`, { program_ids: [Number(attachId)] })
      setDetail((prev) => ({ ...prev, [evId]: { ...prev[evId], programs: res?.programs || prev[evId]?.programs || [] } }))
      setAttachId('')
    } catch (e) {
      setErr(e.message || 'Failed to attach program')
    } finally {
      setBusy('')
    }
  }

  const detachProgram = async (evId, programId) => {
    setBusy(`detach-${evId}-${programId}`)
    setErr('')
    try {
      await apiDelete(`/operator/events/${evId}/programs/${programId}`)
      const programs = await apiGet(`/operator/events/${evId}/programs`)
      setDetail((prev) => ({ ...prev, [evId]: { ...prev[evId], programs: Array.isArray(programs) ? programs : [] } }))
    } catch (e) {
      setErr(e.message || 'Failed to remove program')
    } finally {
      setBusy('')
    }
  }

  const attachedIds = (id) => new Set(((detail[id]?.programs) || []).map((p) => p.id))
  const availablePrograms = (id) => {
    const used = attachedIds(id)
    return allPrograms.filter((p) => !used.has(p.id))
  }

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Events</h2>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
            Events the app operators pick every day. Programs attached to an event appear under it; beneficiaries marked (kit given) roll up under the event too.
          </div>
        </div>
        <button onClick={openNew} style={{ ...styles.btn, background: 'var(--sage)', color: '#fff' }}>+ New Event</button>
      </div>

      {err && (
        <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: '#fee2e2', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>{err}</div>
      )}

      {showForm && (
        <div style={styles.overlay} onClick={() => setShowForm(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', margin: 0, marginBottom: '16px' }}>
              {edit ? 'Edit Event' : 'New Event'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={styles.field}>
                <label style={styles.label}>Title *</label>
                <input style={{ ...styles.input, width: '100%' }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Date *</label>
                <input type="date" style={{ ...styles.input, width: '100%' }} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Start time</label>
                <input type="time" style={{ ...styles.input, width: '100%' }} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>End time</label>
                <input type="time" style={{ ...styles.input, width: '100%' }} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Location</label>
                <input style={{ ...styles.input, width: '100%' }} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>State</label>
                <input style={{ ...styles.input, width: '100%' }} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
                <label style={styles.label}>Description</label>
                <textarea rows={2} style={{ ...styles.input, width: '100%', fontFamily: 'inherit' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowForm(false)} style={{ ...styles.btn, background: 'var(--bg)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.title || !form.event_date} style={{ ...styles.btn, background: 'var(--sage)', color: '#fff', opacity: saving || !form.title || !form.event_date ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.card}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>Loading...</div>
        ) : events.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>No events. Add one above.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Location</th>
                <th style={styles.th}>Attached</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const open = openId === ev.id
                const d = detail[ev.id]
                return (
                  <Fragment key={ev.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => loadDetail(ev.id)}>
                      <td style={styles.td}>{ev.title}</td>
                      <td style={styles.td}>{fmtDate(ev.event_date)}</td>
                      <td style={styles.td}>{fmtTime(ev.start_time)} – {fmtTime(ev.end_time)}</td>
                      <td style={styles.td} className="sa-muted">{ev.location || ev.state || '—'}</td>
                      <td style={styles.td}>{d ? (d.programs?.length || 0) : '—'}</td>
                      <td style={styles.td}>
                        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(ev) }}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); remove(ev.id) }} style={{ marginLeft: 4 }}>Del</button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} style={{ ...styles.td, background: 'var(--bg)', padding: '18px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            {/* Programs */}
                            <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', padding: '12px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>Programs under this event</div>
                              {(d?.programs || []).length === 0 ? (
                                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px' }}>No programs attached yet.</div>
                              ) : (
                                <table style={{ ...styles.table, marginBottom: '8px' }}>
                                  <tbody>
                                    {(d?.programs || []).map((p) => (
                                      <tr key={p.id}>
                                        <td style={{ ...styles.td, borderBottom: '1px solid var(--line)' }}>{p.title}</td>
                                        <td style={{ ...styles.td, borderBottom: '1px solid var(--line)' }}>{p.program_date || '—'}</td>
                                        <td style={{ ...styles.td, borderBottom: '1px solid var(--line)', textAlign: 'right' }}>
                                          <button disabled={busy === `detach-${ev.id}-${p.id}`} onClick={() => detachProgram(ev.id, p.id)} style={{ ...styles.btn, background: 'var(--bg)', color: '#991b1b', opacity: busy === `detach-${ev.id}-${p.id}` ? 0.5 : 1 }}>Remove</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <select value={attachId} onChange={(e) => setAttachId(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                                  <option value="">Attach a program…</option>
                                  {availablePrograms(ev.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                                  {availablePrograms(ev.id).length === 0 && <option disabled>No more programs to attach</option>}
                                </select>
                                <button disabled={!attachId || busy === `attach-${ev.id}`} onClick={() => attachProgram(ev.id)} style={{ ...styles.btn, background: 'var(--sage)', color: '#fff', opacity: !attachId || busy === `attach-${ev.id}` ? 0.5 : 1 }}>Attach</button>
                              </div>
                            </div>

                            {/* Marked beneficiaries */}
                            <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', padding: '12px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>
                                Beneficiaries marked (kit given) here · {(d?.beneficiaries || []).length}
                              </div>
                              {(d?.beneficiaries || []).length === 0 ? (
                                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>None yet. When the operator marks a bonus beneficiary at this event, it shows up here.</div>
                              ) : (
                                <table style={styles.table}>
                                  <tbody>
                                    {(d?.beneficiaries || []).map((b) => (
                                      <tr key={b.audit_id}>
                                        <td style={{ ...styles.td, borderBottom: '1px solid var(--line)' }}>{b.full_name}</td>
                                        <td style={{ ...styles.td, borderBottom: '1px solid var(--line)', width: '30%' }}>{b.beneficiary_code}</td>
                                        <td style={{ ...styles.td, borderBottom: '1px solid var(--line)', width: '30%' }}>{fmtDateTime(b.performed_at)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
