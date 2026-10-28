import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader, Select, Badge, Empty } from '../components/ui.jsx'
import { fetchWorkspaceNgos, fetchSectors, fetchActivities, savePlannerManualRow } from '../store.jsx'
// The Monthly Planner already owns the AI suggestion panel and the "Add as
// programme" form. Reusing them here keeps one generation path, one tick store
// and one create-event call, so a programme planned from this page is the exact
// same record the Monthly Planner shows on its grid.
import { SuggestionPanel, PlanModal } from './ActivityPlanner.jsx'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const pad2 = (n) => String(n).padStart(2, '0')

/** Never toISOString() here — IST midnight is the previous day in UTC. */
const currentMonthYmd = () => {
  const n = new Date()
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}`
}

const monthLabel = (ymd) => {
  const [y, m] = String(ymd).split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/* The team calls these NGOs by their codes (BSCT, AFLF, MANN), so codes win over
   the long registered names wherever a short label is needed. */
const ngoShortLabel = (n) =>
  String(n?.code || '').trim() || String(n?.name || '').trim() || 'NGO'

const LABEL = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--eh-ink-soft)' }

/* ── Suggest Programmes ─────────────────────────────────────────────────────
   A dedicated screen for the Social team: pick the segment (NGO → Sector →
   Activity → month), read the AI ideas for it, and turn any idea into a real
   programme. Because it writes the same event the Monthly Planner reads, the
   programme lands on the planner's grid the moment it is saved. */
export default function SuggestProgrammes() {
  const [ngos, setNgos] = useState([])
  const [sectors, setSectors] = useState([])
  const [activities, setActivities] = useState([])

  const [ngoId, setNgoId] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [activityId, setActivityId] = useState('')
  const [month, setMonth] = useState(currentMonthYmd())

  const [planEntry, setPlanEntry] = useState(null)
  const [rev, setRev] = useState(0)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetchWorkspaceNgos().then((l) => setNgos(Array.isArray(l) ? l : [])).catch(() => setNgos([]))
  }, [])

  /* Sectors follow the chosen NGO; a new NGO clears the narrower picks so the
     screen can never show a sector or activity that does not belong to it. */
  useEffect(() => {
    let alive = true
    fetchSectors(ngoId ? { ngo_id: ngoId } : {})
      .then((l) => { if (alive) setSectors(Array.isArray(l) ? l : []) })
      .catch(() => { if (alive) setSectors([]) })
    return () => { alive = false }
  }, [ngoId])

  useEffect(() => { setSectorId(''); setActivityId('') }, [ngoId])
  useEffect(() => { setActivityId('') }, [sectorId])

  useEffect(() => {
    let alive = true
    fetchActivities({ ngo_id: ngoId || undefined, sector_id: sectorId || undefined })
      .then((l) => { if (alive) setActivities(Array.isArray(l) ? l : []) })
      .catch(() => { if (alive) setActivities([]) })
    return () => { alive = false }
  }, [ngoId, sectorId])

  const ngo = useMemo(() => ngos.find((n) => String(n.id) === String(ngoId)) || null, [ngos, ngoId])
  const activity = useMemo(() => activities.find((a) => String(a.id) === String(activityId)) || null, [activities, activityId])

  // Sectors are shared across NGOs (the backend has no per-NGO sector), so the
  // chosen NGO must never hide them — every sector stays selectable and the
  // activity list is what narrows to the NGO.
  const sectorOptions = useMemo(() => sectors, [sectors])

  const clearPlan = useCallback(() => setActivityId(''), [])

  const onSaved = ({ suggestion, programmes = [], lastDate } = {}) => {
    setPlanEntry(null)
    setRev((v) => v + 1)
    const name = programmes[0]?.name || suggestion?.title || 'Programme'
    const date = lastDate || programmes[0]?.date || `${month}-01`
    const [y, m] = String(month).split('-').map(Number)
    // Mirror the added programme into the Monthly Planner's manual rows so it
    // appears as a row in that page's table (not only on the Calendar).
    const suffix = `+${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 1296).toString(36)}`
    savePlannerManualRow({
      month: Number.isFinite(m) ? m : undefined,
      year: Number.isFinite(y) ? y : undefined,
      observance_date: date,
      festival: suffix,
      ngo_id: ngoId || null,
      row_ngo_id: ngoId || '',
      name,
      body_text: suggestion?.objective || '',
      is_selected: false,
      mode: null,
    }).catch(() => { /* manual row is best-effort; the event is already saved */ })
    setToast(`“${name}” added to ${monthLabel(month)} — it is on the Monthly Planner.`)
    setTimeout(() => setToast(''), 6000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Suggest Programmes"
        subtitle="Pick an NGO, sector, activity and month, then let the AI propose programmes. Anything you add lands on the Monthly Planner."
      />

      {/* ── Segmentation ─────────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--eh-line)', borderRadius: 12, padding: '14px 16px', background: 'var(--eh-card, var(--card-bg))' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={LABEL}>NGO</span>
            <Select value={ngoId} onChange={setNgoId}>
              <option value="">All NGOs</option>
              {ngos.map((n) => <option key={n.id} value={n.id}>{ngoShortLabel(n)}</option>)}
            </Select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={LABEL}>Sector</span>
            <Select value={sectorId} onChange={setSectorId}>
              <option value="">All sectors</option>
              {sectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={LABEL}>Activity</span>
            <Select value={activityId} onChange={setActivityId}>
              <option value="">Choose an activity…</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.name}{a.sector_name ? ` · ${a.sector_name}` : ''}</option>)}
            </Select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={LABEL}>Month</span>
            <input className="eh-select" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 11.5, color: 'var(--eh-ink-faint)' }}>
          <Badge tone="muted">{activities.length} activities in this segment</Badge>
          <span>Narrow with NGO and sector, then pick the activity to suggest programmes for.</span>
        </div>
      </div>

      {toast && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'var(--eh-success-soft)', color: 'var(--eh-success)', fontSize: 12.5, fontWeight: 600 }}>
          <span>✓ {toast}</span>
            <Link to={`/social/planner?month=${encodeURIComponent(month)}${ngoId ? `&ngo=${encodeURIComponent(ngoId)}` : ''}`} style={{ color: 'inherit', textDecoration: 'underline', marginLeft: 'auto', fontWeight: 700 }}>
              View in Monthly Planner →
            </Link>
        </div>
      )}

      {/* ── Suggestions for the chosen activity ─────────────────────────── */}
      {activity ? (
        <SuggestionPanel
          key={`${activity.id}-${ngoId}-${month}`}
          activity={activity}
          ngo={ngo}
          month={month}
          onClose={clearPlan}
          onPlan={(s) => setPlanEntry({ activity, suggestion: s, ngo, month })}
          refreshRev={rev}
        />
      ) : (
        <Empty icon="✦">
          Choose an activity above to see the AI programme ideas for {monthLabel(month)}.
        </Empty>
      )}

      {planEntry && (
        <PlanModal
          entry={planEntry}
          ngo={planEntry.ngo}
          month={planEntry.month}
          onClose={() => setPlanEntry(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
