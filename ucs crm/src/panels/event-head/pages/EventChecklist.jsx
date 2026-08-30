import { useState, useEffect, useCallback, useMemo } from 'react'
import { CHECKLIST_ITEMS, fetchEvents, fetchWorkspaceNgos, fetchChecklist, createChecklistItem, updateChecklistItem } from '../store'

const fmtDate = (d) => {
  if (!d) return '—'
  return String(d).slice(0, 10)
}
const fmtTime = (t) => {
  if (!t) return ''
  const hm = String(t).slice(0, 5).split(':')
  let h = Number(hm[0]); const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(Number(hm[1])).padStart(2, '0')} ${ap}`
}

// Build the canonical template rows for a checklist view.
const templateItems = () => CHECKLIST_ITEMS.map((label, i) => ({ id: `t${i}`, tempId: i, label, status: false, notes: '' }))

const NGO_COLORS = { BSCT: '#7B5EA7', MANN: '#B5603A', AFLF: '#3485D4' }
const ngoColor = (code) => NGO_COLORS[(code || '').toUpperCase()] || '#4F6472'

export default function EventChecklist() {
  const [ngos, setNgos] = useState([])            // { id, name, code }
  const [allEvents, setAllEvents] = useState([])
  const [activeNgo, setActiveNgo] = useState('')   // '' = All, else code
  const [selectedEvent, setSelectedEvent] = useState('')
  const [selectedEventInfo, setSelectedEventInfo] = useState(null)
  const [checklist, setChecklist] = useState(templateItems())
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [loadingChecklist, setLoadingChecklist] = useState(false)
  const [error, setError] = useState('')

  /* ── Resolve NGO code for an event (by ngo_id, falling back to ngo_name) ── */
  const ngoCodeById = useMemo(() => {
    const m = {}
    for (const n of ngos) if (n && n.id != null) m[String(n.id)] = (n.code || n.name || '').toUpperCase()
    return m
  }, [ngos])
  const codeOf = (ev) => {
    const byId = ev.ngo_id != null ? ngoCodeById[String(ev.ngo_id)] : null
    if (byId) return byId
    const byName = (ev.ngo_name || '').toUpperCase()
    return byName && byName !== 'ALL NGOS' ? byName : '—'
  }

  /* ── Load all live events + NGO namespace (once) ── */
  const loadEvents = useCallback(async () => {
    setLoadingEvents(true); setError('')
    try {
      let list = []
      try { list = (await fetchWorkspaceNgos()) || [] } catch (e) { console.error('fetchWorkspaceNgos:', e) }
      const ngoList = list.filter(n => n && n.id != null)
      setNgos(ngoList)

      let evs = []
      try { evs = (await fetchEvents()) || [] } catch (e) { console.error('fetchEvents:', e) }
      setAllEvents(evs || [])
    } catch (e) {
      setError('Failed to load events: ' + (e.message || 'Unknown error'))
      console.error(e)
    } finally { setLoadingEvents(false) }
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])

  /* ── Events scoped to the active NGO (or all) ── */
  const ngoCodes = useMemo(() => {
    const codes = [...new Set(ngos.map(n => (n.code || n.name || '').toUpperCase()).filter(c => c && c !== 'ALL NGOS'))]
    const fromEvents = [...new Set(allEvents.map(codeOf).filter(c => c !== '—'))]
    return [...new Set([...codes, ...fromEvents])].sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ngos, allEvents])

  const events = useMemo(() => {
    if (!activeNgo) return allEvents
    return allEvents.filter(ev => codeOf(ev) === activeNgo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, activeNgo, ngoCodeById])

  const countByNgo = useMemo(() => {
    const c = {}
    for (const ev of allEvents) {
      const k = codeOf(ev)
      c[k] = (c[k] || 0) + 1
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, ngoCodeById])

  /* ── Load live checklist for the selected event ── */
  useEffect(() => {
    if (!selectedEvent) {
      setSelectedEventInfo(null)
      setChecklist(templateItems())
      setLoadingChecklist(false)
      return
    }
    const ev = events.find(e => String(e.id) === String(selectedEvent)) || null
    setSelectedEventInfo(ev)
    let cancelled = false
    setLoadingChecklist(true)
    setChecklist(templateItems())
    fetchChecklist(selectedEvent)
      .then(data => {
        if (cancelled) return
        const rows = data || []
        setChecklist(rows.length ? rows : templateItems())
      })
      .catch(() => { if (!cancelled) setChecklist(templateItems()) })
      .finally(() => { if (!cancelled) setLoadingChecklist(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, events])

  /* ── Persist a checklist item. Template rows (t*) are created on first save,
   *       then swapped to their real DB id so later edits update in place. ── */
  const isTemplate = (item) => typeof item.id === 'string' && String(item.id).startsWith('t')
  const applySaved = (saved) => {
    if (!saved) return
    setChecklist(prev => prev.map(c => String(c.id) === (String(saved.id) || String(c.id)) ? { ...c, ...saved } : c))
  }

  /* ── Toggle completion (saves live) ── */
  const toggle = async (item) => {
    const updated = { ...item, status: !item.status }
    setChecklist(checklist.map(c => String(c.id) === String(item.id) ? updated : c))
    if (!selectedEvent) return
    try {
      if (isTemplate(item)) {
        const saved = await createChecklistItem(selectedEvent, { label: item.label, status: updated.status, notes: updated.notes })
        if (saved) setChecklist(prev => prev.map(c => String(c.id) === String(item.id) ? { ...saved, tempId: item.tempId } : c))
      } else {
        const saved = await updateChecklistItem(selectedEvent, item.id, { status: updated.status, notes: updated.notes })
        applySaved(saved)
      }
    } catch (e) { console.error('EventChecklist toggle:', e) }
  }

  /* ── Edit notes (saves live); template rows are created on first edit ── */
  const setNotes = async (item, notes) => {
    const updated = { ...item, notes }
    setChecklist(checklist.map(c => String(c.id) === String(item.id) ? updated : c))
    if (!selectedEvent) return
    try {
      if (isTemplate(item)) {
        const saved = await createChecklistItem(selectedEvent, { label: item.label, status: item.status, notes })
        if (saved) setChecklist(prev => prev.map(c => String(c.id) === String(item.id) ? { ...saved, tempId: item.tempId } : c))
      } else {
        await updateChecklistItem(selectedEvent, item.id, { status: item.status, notes })
      }
    } catch (e) { console.error('EventChecklist setNotes:', e) }
  }

  const completed = checklist.filter(c => c.status).length
  const activeLabel = activeNgo || 'All NGOs'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Scope header: All NGOs | BSCT | MANN | AFLF */}
      <div className="eh-section">
        <div className="eh-section-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>Event Checklist</h3>
            <div className="eh-section-sub">Live events across all NGOs — each event loads and saves its own checklist.</div>
          </div>
          <div className="eh-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eh-badge" style={{ background: 'var(--eh-primary-soft,#e8ecfb)', color: 'var(--eh-primary,#2036bd)', whiteSpace: 'nowrap' }}>
              {loadingEvents ? 'Loading…' : `${allEvents.length} live events`}
            </span>
            <button className="eh-btn eh-btn-primary" onClick={loadEvents} disabled={loadingEvents}>
              {loadingEvents ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        <div className="eh-section-body">
          {/* NGO chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button
              onClick={() => { setActiveNgo('') }}
              style={{
                padding: '7px 14px', borderRadius: 999, border: `1px solid ${!activeNgo ? 'var(--eh-primary,#2036bd)' : 'var(--eh-line,#e8e6f2)'}`,
                background: !activeNgo ? 'var(--eh-primary-soft,#e8ecfb)' : '#fff',
                color: !activeNgo ? 'var(--eh-primary,#2036bd)' : 'var(--eh-ink-soft,#6a6f8f)',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
              }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#4F6472' }} />
              All NGOs <span style={{ fontWeight: 700 }}>({allEvents.length})</span>
            </button>
            {ngoCodes.map(code => (
              <button
                key={code}
                onClick={() => { setActiveNgo(code); setSelectedEvent('') }}
                style={{
                  padding: '7px 14px', borderRadius: 999, border: `1px solid ${activeNgo === code ? ngoColor(code) : 'var(--eh-line,#e8e6f2)'}`,
                  background: activeNgo === code ? ngoColor(code) : '#fff',
                  color: activeNgo === code ? '#fff' : 'var(--eh-ink-soft,#6a6f8f)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: ngoColor(code) }} />
                {code} <span style={{ fontWeight: 700 }}>({countByNgo[code] || 0})</span>
              </button>
            ))}
          </div>

          {/* Event picker + selected event info (responsive) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 260, flex: '1 1 320px' }}>
              <label className="eh-grid-label" style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--eh-ink-soft,#6a6f8f)', marginBottom: 6 }}>
                Event ({activeLabel})
              </label>
              <select
                className="eh-select"
                value={selectedEvent}
                onChange={e => setSelectedEvent(e.target.value)}
                style={{ width: '100%' }}>
                <option value="">General Checklist (no event)</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    [{codeOf(ev) || '—'}] {ev.name}{ev.date ? ` · ${fmtDate(ev.date)}` : ''}
                  </option>
                ))}
              </select>
              {!loadingEvents && events.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--eh-ink-soft,#6a6f8f)' }}>
                  No events found for {activeLabel} yet.
                </div>
              )}
            </div>

            {selectedEventInfo && (
              <div className="eh-grid-2" style={{ flex: '2 1 340px', gap: '6px 20px', fontSize: 12.5, color: 'var(--eh-ink-soft,#6a6f8f)' }}>
                <div><b style={{ color: 'var(--eh-ink,#0f1128)' }}>{selectedEventInfo.name}</b></div>
                <div>Date: <b>{fmtDate(selectedEventInfo.date)}</b>{selectedEventInfo.start_time ? ` · ${fmtTime(selectedEventInfo.start_time)}` : ''}</div>
                <div>NGO: <b>{selectedEventInfo.ngo_name || codeOf(selectedEventInfo) || '—'}</b></div>
                <div>Sector: <b>{selectedEventInfo.sector_name || '—'}</b></div>
                <div>Activity: <b>{selectedEventInfo.activity_name || (selectedEventInfo.activities || []).map(a => a.name).join(', ') || '—'}</b></div>
                <div>Status: <b>{selectedEventInfo.status || '—'}</b></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="eh-section">
        <div className="eh-section-head" style={{ flexWrap: 'wrap' }}>
          <h3>{selectedEventInfo ? `${selectedEventInfo.name} — Checklist` : 'General Checklist'}</h3>
          {selectedEvent && <span className="eh-badge" style={{ background: 'var(--eh-primary-soft,#e8ecfb)', color: 'var(--eh-primary,#2036bd)' }}>{completed}/{checklist.length}</span>}
        </div>
        <div className="eh-section-body">
          {selectedEvent && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--eh-line,#e8e6f2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${checklist.length ? (completed / checklist.length) * 100 : 0}%`, background: 'var(--eh-success,#16a34a)', borderRadius: 3, transition: 'width .3s' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--eh-ink-soft,#6a6f8f)', whiteSpace: 'nowrap' }}>{completed}/{checklist.length} done</span>
            </div>
          )}

          {error && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#fdecef', color: 'var(--eh-danger,#e53e5b)', fontSize: 13 }}>{error}</div>}

          {loadingChecklist ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--eh-ink-soft,#6a6f8f)', fontSize: 13 }}>Loading checklist…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checklist.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: 'var(--eh-surface-2,#fff)', border: '1px solid var(--eh-line,#e8e6f2)', borderRadius: 11,
                  opacity: item.status ? 0.65 : 1, flexWrap: 'wrap'
                }}>
                  <input
                    type="checkbox"
                    checked={!!item.status}
                    onChange={() => toggle(item)}
                    style={{ width: 18, height: 18, accentColor: 'var(--eh-success,#16a34a)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, textDecoration: item.status ? 'line-through' : 'none', color: item.status ? 'var(--eh-ink-soft,#6a6f8f)' : 'var(--eh-ink,#0f1128)' }}>
                      {item.label || item.name || ''}
                    </div>
                    <input
                      value={item.notes || ''}
                      onChange={e => setNotes(item, e.target.value)}
                      placeholder="Add note…"
                      disabled={!!item.status}
                      style={{
                        marginTop: 6, width: '100%', maxWidth: 460, padding: '6px 10px',
                        fontSize: 12, border: '1px solid var(--eh-line,#e8e6f2)', borderRadius: 8,
                        background: item.status ? 'rgba(0,0,0,.03)' : '#fff', fontFamily: 'inherit'
                      }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
