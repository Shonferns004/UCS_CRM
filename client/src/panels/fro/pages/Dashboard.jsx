import { useState, useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import { getMyDashboard, getMyCollections, getMonthlyDonors, getFroDonorList } from '../api/donors'
import { getMyTarget } from '../api/target'
import { SkeletonDashboard } from '../../../components/Skeleton'
import RecentNotices from '../../../components/RecentNotices'
import { cacheGet, cacheSet, cacheAge } from '../../../utils/cache'
import { useCall } from '../CallContext'
import { api, getUser } from '../api/auth'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { istMonthKey, istParts } from '../../../utils/istDate'

const currency = n => n != null ? '₹' + Number(n).toLocaleString('en-IN') : '—'

// '2026-09-01' -> 'Sep 2026'
const monthLabel = (v) => {
  if (!v) return ''
  const [y, m] = String(v).slice(0, 7).split('-')
  if (!y || !m) return String(v)
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

const fmtStamp = (v) => {
  if (!v) return '—'
  const iso = String(v)
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso) || /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.\d+)?Z$/.test(iso)
  if (isDateOnly) {
    return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function callFmt(seconds) {
  if (seconds == null) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const Icon = ({ children, color }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color || 'var(--ink)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

const pad2 = n => String(n).padStart(2, '0')

const todayYM = () => istMonthKey()

const monthLabelOf = (ym) => {
  // ym: 'YYYY-MM' → 'August 2026'
  const [y, m] = String(ym || '').split('-').map(Number)
  if (!y || !m) return ''
  return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function IncentiveCalendar({ akiPerDay = [], monthStr, onlyEligible }) {
  const [y, m] = (monthStr || '').split('-').map(Number)
  if (!y || !m) return <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No month data</div>

  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDay = new Date(y, m - 1, 1).getDay()
  const akiMap = {}
  akiPerDay.forEach(r => { akiMap[r.date] = r })

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const weekday = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${pad2(m)}-${pad2(d)}`
    const rec = akiMap[dateStr]
    const aki = rec ? rec.aki : 0
    cells.push({ d, dateStr, rec, aki, eligible: aki > 0, show: !onlyEligible || aki > 0 })
  }

return (
    // overflowX hidden: nothing on this page scrolls sideways; belt-and-braces
    // so no child overflow can ever grow a horizontal scrollbar.
    <div style={{ overflowX: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
        {weekday.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          if (!c || !c.show) return <div key={i} style={{ height: 50 }} />
          const isToday = c.dateStr === todayStr
          return (
            <div key={i} title={c.rec ? `₹${Number(c.rec.collection || 0).toLocaleString('en-IN')} collected · AKI ₹${c.aki}` : undefined} style={{
              height: 50, borderRadius: 8, border: `1.5px solid ${c.eligible ? '#86efac' : '#e2e8f0'}`,
              background: c.eligible ? 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)' : '#f8fafc',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
              overflow: 'hidden',
              outline: isToday ? '2px solid var(--sage)' : 'none', outlineOffset: isToday ? 1 : 0,
            }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: c.eligible ? '#166534' : '#94a3b8', lineHeight: 1.1 }}>{c.d}</span>
              {c.rec && (
                <span style={{ fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', lineHeight: 1.1, color: c.eligible ? '#14532d' : '#334155' }}>
                  {'₹' + Number(c.rec.collection || 0).toLocaleString('en-IN')}
                </span>
              )}
              {c.aki > 0 && (
                <span style={{ fontSize: 7.5, fontWeight: 800, color: '#166534', background: '#bbf7d0', padding: '1px 4px', borderRadius: 999, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                  AKI ₹{c.aki}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--ink-soft)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#dcfce7', border: '1px solid #86efac', display: 'inline-block' }} /> Eligible (AKI earned)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--ink-soft)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'inline-block' }} /> No AKI
        </span>
      </div>
    </div>
  )
}

// How long a cached dashboard payload counts as fresh enough to skip refetching.
// Short by design: the numbers only move when the FRO themselves act, but a
// save must still show up promptly, so this only covers the bounce between
// Dashboard and My Leads — not a genuine reload.
const DASH_FRESH_MS = 60 * 1000

export default function Dashboard() {
  // Scoped to the signed-in worker, and resolved per render rather than at
  // module load. A shared global key would hand one FRO another's dashboard
  // numbers, and skipping the refetch would keep that wrong page on screen for a
  // full minute — nothing else clears this store, including logout.
  const CACHE_KEY = `fro_dashboard:${getUser()?.id ?? 'anon'}`
  const cached = cacheGet(CACHE_KEY)
  const cachedAge = cacheAge(CACHE_KEY)
  // Lookback window (last 1, 2 or 3 months) for the active/inactive donor
  // split; default monthly.
  const [donorView, setDonorView] = useState('1')
  const [donorStatus, setDonorStatus] = useState('active')
  // Fresh only for the window it was stored with — monthly counts differ
  // from quarterly/yearly ones, so a cached yearly payload cannot back the
  // monthly view (or vice versa).
  const dashIsFresh = !!cached && (cachedAge ?? Infinity) < DASH_FRESH_MS && cached.donorView === donorView
  const { todayStats } = useCall()
  const isMobile = useIsMobile()
  const [dashData, setDashData] = useState(cached?.dash || null)
  const [targetData, setTargetData] = useState(cached?.target || null)
  const [loading, setLoading] = useState(!cached)
  const [monthlyDonors, setMonthlyDonors] = useState([])
  const [showMonthlyModal, setShowMonthlyModal] = useState(false)
  const [assignedView, setAssignedView] = useState('total')
  const [showCollections, setShowCollections] = useState(false)
  const [collectionsData, setCollectionsData] = useState(null)
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [selectedCollectionNgo, setSelectedCollectionNgo] = useState('all')
  const [collectionSearch, setCollectionSearch] = useState('')
  const [collectionsByNgo, setCollectionsByNgo] = useState({})
  const [ngoMap, setNgoMap] = useState({})
  const [collectionsMonth, setCollectionsMonth] = useState('current')
  const [collectionsMonthLabel, setCollectionsMonthLabel] = useState('')
  const [connectedView, setConnectedView] = useState('daily')
  const [donationView, setDonationView] = useState('today')
  const [splitModal, setSplitModal] = useState(null)
  const [splitDonors, setSplitDonors] = useState([])
  const [splitTotal, setSplitTotal] = useState(0)
  const [splitLoading, setSplitLoading] = useState(false)
  // The notices list fills whatever height the grid gives it, so without a
  // definite height the row grows to the notices' natural content height and
  // the card dwarfs the calendar. Measure the calendar and pin the notices to
  // exactly that height instead.
  const calRef = useRef(null)
  const [calHeight, setCalHeight] = useState(null)
  useEffect(() => {
    if (!calRef.current) return
    const ro = new ResizeObserver(() => setCalHeight(calRef.current?.offsetHeight || null))
    ro.observe(calRef.current)
    return () => ro.disconnect()
  }, [loading])

  const today = new Date()
  const istToday = istParts(today)
  const day = istToday.day
  const monthStr = istMonthKey(today)
  const isMonthlyPopupSeason = day >= 1 && day <= 3

  useEffect(() => {
    let cancelled = false
    const safeSet = (setter, value) => { if (!cancelled) setter(value) }

    // Render as soon as the core dashboard request returns. Follow-ups,
    // lead stats, and monthly donors enrich the page afterwards instead of
    // keeping the whole screen in a loading state.
    //
    // These two are the expensive pair, so a payload this session already holds
    // is reused instead of re-requested. The backend caches them too, so this
    // mainly removes the round trip — but it also means revisiting the dashboard
    // inside a minute costs nothing at either end.
    if (dashIsFresh) {
      safeSet(setLoading, false)
    } else {
      const dashboardRequest = getMyDashboard(donorView)
        .catch((err) => { console.error('API error:', err.message); return null })
      const targetRequest = getMyTarget()
        .catch((err) => { console.error('API error:', err.message); return null })

      dashboardRequest.then(data => {
        safeSet(setDashData, data)
        safeSet(setLoading, false)
      })

      targetRequest.then(data => safeSet(setTargetData, data))

      Promise.all([dashboardRequest, targetRequest]).then(([dash, target]) => {
        if (dash || target) cacheSet(CACHE_KEY, { dash, target, donorView }, 5 * 60 * 1000)
      })
    }

    if (isMonthlyPopupSeason) {
      getMonthlyDonors(monthStr)
        .then(data => {
          const donors = data || []
          safeSet(setMonthlyDonors, donors)
          if (!cancelled && donors.length > 0 && localStorage.getItem('monthly_donors_dismissed') !== monthStr) setShowMonthlyModal(true)
        })
        .catch((err) => { console.error('API error:', err.message); safeSet(setMonthlyDonors, []) })
    }

    return () => { cancelled = true }
  }, [])

  // The mount fetch covers the initial window; switching the active-donor
  // toggle re-requests only the dashboard payload (target, follow-ups and lead
  // stats are window-independent).
  const donorViewRef = useRef(donorView)
  useEffect(() => {
    if (donorViewRef.current === donorView) return
    donorViewRef.current = donorView
    let cancelled = false
    getMyDashboard(donorView)
      .then(data => { if (!cancelled && data) setDashData(data) })
      .catch((err) => { console.error('API error:', err.message) })
    return () => { cancelled = true }
  }, [donorView])

  // Donor roster for the active/inactive/total modals — fetched on open, not
  // with the dashboard payload, because a couple thousand names would bloat
  // every dashboard fetch for a list only shown on click.
  useEffect(() => {
    if (!splitModal) return
    let cancelled = false
    setSplitLoading(true)
    setSplitDonors([])
    setSplitTotal(0)
    // Inactive ignores the window pills entirely (fixed one-month rule), so
    // don't send the pill state along — a leftover 'all' from an earlier
    // session would otherwise ride on the request.
    getFroDonorList(splitModal.status, splitModal.status === 'inactive' ? '1' : donorView)
      .then(data => {
        if (cancelled) return
        setSplitDonors(data?.donors || [])
        setSplitTotal(data?.total ?? 0)
      })
      .catch((err) => { console.error('API error:', err.message) })
      .finally(() => { if (!cancelled) setSplitLoading(false) })
    return () => { cancelled = true }
  }, [splitModal])

  const openCollections = async (ngoId, month) => {
    const isToggle = month !== undefined
    const targetMonth = isToggle ? month : collectionsMonth
    if (targetMonth !== collectionsMonth) setCollectionsMonth(targetMonth)
    setShowCollections(true)
    setCollectionsLoading(true)
    if (ngoId !== undefined) setSelectedCollectionNgo(String(ngoId))
    setCollectionsMonthLabel(targetMonth === 'current' ? monthLabelOf(todayYM()) : monthLabelOf(targetMonth))
    try {
      const res = await getMyCollections(ngoId, targetMonth)
      if (res?.month) setCollectionsMonthLabel(monthLabelOf(res.month))
      // Keep the whole response, not just its rows: it carries the server-side
      // total so the modal can show the subtotal of what it rendered.
      setCollectionsData(res)
      let collectionsByNgo = res?.collections || { all: [] }
      let ngoMap = res?.ngoMap || {}
      
      // Handle both API response formats:
      // New format: { all: [...], ngoId1: [...], ngoId2: [...] }
      // Old format: flat array [...]
      if (Array.isArray(collectionsByNgo)) {
        const allCollections = collectionsByNgo
        // Build NGO map from collections if not provided
        if (Object.keys(ngoMap).length === 0) {
          const ngoIds = new Set()
          for (const c of allCollections) {
            if (c.ngo_id) ngoIds.add(c.ngo_id)
          }
          if (ngoIds.size > 0) {
            const { data: ngos } = await api(`/ngo-admin/ngos`)
            const allNgos = ngos || []
            for (const nid of ngoIds) {
              const ngo = allNgos.find(n => n.id === nid)
              if (ngo) ngoMap[nid] = ngo.name
            }
          }
        }
        // Group by NGO
        const byNgo = {}
        for (const c of allCollections) {
          const ngoId = c.ngo_id || null
          if (!byNgo[ngoId]) byNgo[ngoId] = []
          byNgo[ngoId].push(c)
        }
        collectionsByNgo = { all: allCollections, ...byNgo }
      }
      
      setCollectionsByNgo(collectionsByNgo)
      setNgoMap(ngoMap)
      if (!isToggle) setSelectedCollectionNgo('all')
    } catch (err) {
      console.error('Error:', err.message)
      setCollectionsByNgo({ all: [] })
      setNgoMap({})
      // Cleared with the rows: a total left over from the previous month would
      // otherwise be shown next to an empty list.
      setCollectionsData(null)
    } finally {
      setCollectionsLoading(false)
    }
  }

  if (loading) return <SkeletonDashboard />

  const ts = targetData || {}
  let ds = dashData || {}

  // Map new nested structure to old flat field names for backward compat
  if (ds.worker || ds.target?.amount != null || ds.connected || ds.donations || ds.verification || ds.data) {
    const d = ds
    ds = {
      is_active: d.worker?.is_active,
      is_punched_in: d.worker?.is_punched_in,
      target: d.target?.amount,
      collected: d.target?.collected,
      collected_high_tier: d.target?.collected_high_tier,
      achieved_target: d.target?.achieved,
      monthly_connected: d.connected?.monthly,
      daily_connected: d.connected?.daily,
      daily_donations: d.donations?.daily,
      daily_donor_count: d.donations?.daily_donors,
      monthly_donor_count: d.donations?.monthly_donors,
      data_used: d.data?.used,
      active_donors: d.donors?.active,
      inactive_donors: d.donors?.inactive,
      verified_month_count: d.verification?.month?.verified?.count,
      verified_today_amount: d.verification?.today?.verified?.amount,
      verified_today_count: d.verification?.today?.verified?.count,
      stats: d.stats,
      assignedData: d.assignedData,
    }
  }
  const { stats = {} } = ds
  const target = ts.target || ds.target || 0
  const collected = ts.collected ?? ds.collected ?? 0
  // How much of `collected` came out of High Tier data. The server sends it as
  // a slice of the same total (never an addition), so Collected = High Tier +
  // Normal by construction and this line can never disagree with the headline.
  const collectedHighTier = ts.collected_high_tier ?? ds.collected_high_tier ?? 0
  const akiPerDay = ts.incentive?.akiPerDay || []
  const displayCollected = collected
  const collectedByNgo = ts.collected_by_ngo || []
  const remaining = Math.max(0, target - displayCollected)
  const progress = target > 0 ? Math.min(100, (displayCollected / target) * 100) : 0
  const donorWindowLabel = donorView === '12'
    ? 'yearly donors'
    : donorView === '1'
      ? 'monthly donors'
      : `${donorView}-month donors`

  const cq = collectionSearch.trim().toLowerCase()
  const visibleCollections = (collectionsByNgo[selectedCollectionNgo] || []).filter(c => !cq ||
    (c.donor_name || '').toLowerCase().includes(cq) ||
    String(c.donor_mobile || '').includes(cq) ||
    String(c.receipt_no || '').includes(cq))

return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
        gap: 14, marginBottom: 14,
      }}>
        <div className="card" style={{ marginBottom: 0, padding: '12px 16px', border: `1.5px solid ${ds.is_punched_in ? 'var(--sage)' : '#f87171'}`, background: ds.is_punched_in ? 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: ds.is_active ? (ds.is_punched_in ? '#16a34a' : '#f87171') : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{ds.is_punched_in ? 'check_circle' : ds.is_active ? 'schedule' : 'cancel'}</span>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Live Status</span>
              <div style={{ display: 'flex', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: ds.is_active ? (ds.is_punched_in ? 'var(--sage)' : '#f87171') : '#94a3b8' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ds.is_active ? (ds.is_punched_in ? 'var(--sage)' : '#f87171') : '#e2e8f0', marginRight: 4, verticalAlign: 'middle' }} />
                  {ds.is_active ? (ds.is_punched_in ? 'Punched In' : 'Not Punched') : 'Inactive'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>
                  Data: {ds.data_used ?? 0}/{stats.total ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '12px 16px', border: '1.5px solid #8b5cf6', background: 'linear-gradient(135deg, #faf5ff 0%, #fff 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <Icon color="#8b5cf6">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </Icon>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, flex: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {/* Same window as the Collected card below, and labelled the same way
                  so the two are visibly a pair. */}
              Target{ts.month ? ` · ${monthLabel(ts.month)}` : ''}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{currency(target)}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
            {ts.target_source === 'not_set'
              ? 'Not set by admin'
              : ts.target_source === 'carried_forward' && ts.target_source_month
                // Say where the number came from, otherwise a carried figure looks
                // identical to one someone deliberately set for this month.
                ? `${progress.toFixed(0)}% achieved · carried over from ${monthLabel(ts.target_source_month)}`
                : `${progress.toFixed(0)}% achieved`}
          </div>
        </div>

        <div className="card" onClick={openCollections} style={{ position: 'relative', marginBottom: 0, padding: '12px 16px', border: '1.5px solid var(--sage)', background: 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)', cursor: 'pointer', transition: 'transform .12s, box-shadow .12s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <Icon color="var(--sage)">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="17" y2="12"/><path d="M17 6v12"/>
            </Icon>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, flex: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {/* The figure is scoped to the current calendar month, but on the
                  1st it resets to near-zero and on the last day it is a whole
                  month's work -- which reads like a bug unless the month is
                  stated. Labelled from the server's own `month` value rather than
                  recomputed here, so the label cannot drift from the window the
                  total was actually summed over. */}
              Collected{ts.month ? ` · ${monthLabel(ts.month)}` : ''}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--sage)' }}>{currency(displayCollected)}</span>
            <ChevronRight size={18} color="var(--sage)" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--md-outline-variant)', overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'var(--sage)', width: `${progress}%`, transition: 'width .4s' }} />
          </div>
          {collectedByNgo.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {collectedByNgo.map(item => (
                <span key={item.ngo_id} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: item.ngo_id === 'others' ? '#fef3c7' : '#f0fdf4', color: item.ngo_id === 'others' ? '#92400e' : '#166534', border: `1px solid ${item.ngo_id === 'others' ? '#fde68a' : '#bbf7d0'}` }}>
                  {item.ngo_name}: ₹{Number(item.amount).toLocaleString('en-IN')}
                </span>
              ))}
            </div>
          )}
          {/* A SLICE of the headline above, never an extra figure: these rupees are
              already inside Collected. Always rendered (even ₹0) so the line is a
              stable part of the card rather than appearing only on High Tier days. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, fontWeight: 700, color: collectedHighTier > 0 ? '#8b5cf6' : 'var(--ink-soft)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: collectedHighTier > 0 ? '#8b5cf6' : 'var(--md-outline-variant)', flexShrink: 0 }} />
            High Tier: {currency(collectedHighTier)}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '12px 16px', border: `1.5px solid ${remaining > 0 ? '#e53e3e' : 'var(--sage)'}`, background: remaining > 0 ? 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <Icon color={remaining > 0 ? '#e53e3e' : 'var(--sage)'}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </Icon>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, flex: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>Remaining</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: remaining > 0 ? '#e53e3e' : 'var(--sage)' }}>{currency(remaining)}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
            {remaining > 0 ? `${currency(remaining)} more to hit target` : 'Target achieved!'}
          </div>
        </div>
      </div>

      {/* Flex, not grid: the cards need UNEVEN widths (Incentive compact,
          Active Donors roomy for its pills) while still wrapping as a unit
          when the panel gets narrow. Grow factors share the spare width. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        gap: 14, marginBottom: 14,
      }}>
        <div className="card" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1 1 190px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color={connectedView === 'daily' ? '#3b82f6' : 'var(--sage)'}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </Icon>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Connected</span>
          </div>
          <div style={{ display: 'flex', gap: 3, background: 'var(--bg)', borderRadius: 6, padding: 2, marginBottom: 6 }}>
            {[['daily', 'Daily'], ['month', 'Monthly']].map(([v, label]) => (
              <button key={v} onClick={() => setConnectedView(v)}
                style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
                  background: connectedView === v ? 'var(--sage)' : 'transparent',
                  color: connectedView === v ? '#fff' : 'var(--ink-soft)' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: connectedView === 'daily' ? '#3b82f6' : 'var(--sage)' }}>
            {connectedView === 'daily' ? (ds.daily_connected ?? 0) : (ds.monthly_connected ?? stats.contacted ?? 0)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
            {connectedView === 'daily' ? 'Donors connected today' : 'Donors connected this month'}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1 1 190px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color="#3b82f6">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="6" x2="21" y2="6"/>
            </Icon>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Collection</span>
          </div>
          <div style={{ display: 'flex', gap: 3, background: 'var(--bg)', borderRadius: 6, padding: 2, marginBottom: 6 }}>
            {[['today', 'Today'], ['month', 'Monthly']].map(([v, label]) => (
              <button key={v} onClick={() => setDonationView(v)}
                style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
                  background: donationView === v ? 'var(--sage)' : 'transparent',
                  color: donationView === v ? '#fff' : 'var(--ink-soft)' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#3b82f6' }}>
            {currency(donationView === 'today' ? (ds.daily_donations ?? 0) : collected)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
            {donationView === 'today'
              ? `${ds.daily_donor_count ?? 0} donors today`
              : `${ds.monthly_donor_count ?? 0} donors this month`}
          </div>
        </div>

        {/* Smallest of the row — just an icon, one number and a caption. */}
        <div className="card" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '0.72 1 160px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color="#8b5cf6">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </Icon>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Incentive</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#8b5cf6' }}>{currency(ts.incentive?.totalCollectionAKI ?? 0)}</div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>This month</div>
        </div>

        {/* Widest of the row — holds the Active/Inactive toggle plus six
            cadence pills, which need the extra room to stay on one line. */}
        <div className="card" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1.7 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color="#16a34a">
              <polyline points="20 6 9 17 4 12"/>
            </Icon>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Active Donors</span>
            <div style={{ display: 'flex', gap: 3, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
              {[['active', 'Active'], ['inactive', 'Inactive']].map(([v, label]) => (
                <button key={v} onClick={() => setDonorStatus(v)}
                  style={{ padding: '3px 8px', borderRadius: 5, border: 'none', fontSize: 9, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
                    background: donorStatus === v ? 'var(--sage)' : 'transparent',
                    color: donorStatus === v ? '#fff' : 'var(--ink-soft)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {donorStatus === 'active' && (
            <div style={{ display: 'flex', gap: 3, background: 'var(--bg)', borderRadius: 6, padding: 2, marginBottom: 6 }}>
              {[['1', '1M'], ['2', '2M'], ['3', '3M'], ['6', '6M'], ['8', '8M'], ['12', '1Y']].map(([v, label]) => (
                <button key={v} onClick={() => setDonorView(v)}
                  style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: 'none', fontSize: 9, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
                    background: donorView === v ? 'var(--sage)' : 'transparent',
                    color: donorView === v ? '#fff' : 'var(--ink-soft)' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setSplitModal({ status: donorStatus })}
            style={{ display: 'block', padding: donorStatus === 'active' ? 0 : '6px 0 0', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: donorStatus === 'active' ? '#8b5cf6' : '#f97316' }}>
              {donorStatus === 'active' ? (ds.active_donors ?? 0) : (ds.inactive_donors ?? 0)}
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginLeft: 5 }}>donors</span>
            </div>
          </button>
          <div style={{ fontSize: 9, color: 'var(--ink-soft)', marginTop: 3 }}>
            {donorStatus === 'active'
              ? `${donorWindowLabel} · inactive = no donation in past one month`
              : "Didn't donate in the past one month (incl. never donated)"}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1 1 190px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color="var(--ink)">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>
            </Icon>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Assigned Data</span>
          </div>
          <div style={{ display: 'flex', gap: 3, background: 'var(--bg)', borderRadius: 6, padding: 2, marginBottom: 6 }}>
            {[['total', 'Total'], ['ngo', 'NGO'], ['station', 'Station']].map(([v, label]) => (
              <button key={v} onClick={() => setAssignedView(v)}
                style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: 'none', fontSize: 9, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
                  background: assignedView === v ? 'var(--sage)' : 'transparent',
                  color: assignedView === v ? '#fff' : 'var(--ink-soft)' }}>
                {label}
              </button>
            ))}
          </div>
          {assignedView === 'total' && (
            <>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{stats.total ?? ts.stats?.total ?? 0}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Total donors assigned</div>
            </>
          )}
          {assignedView === 'ngo' && (
            ds.assignedData?.byNgo?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 96, overflowY: 'auto' }}>
                {ds.assignedData.byNgo.map(n => (
                  <div key={n.ngo_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, padding: '1px 0', minWidth: 0 }}>
                    <span style={{ color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, marginRight: 8 }}>{n.ngo_name}</span>
                    <span style={{ fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{n.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>No NGO data</div>
            )
          )}
          {assignedView === 'station' && (
            ds.assignedData?.byStation?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 96, overflowY: 'auto' }}>
                {ds.assignedData.byStation.map(s => (
                  <div key={s.station} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, padding: '1px 0', minWidth: 0 }}>
                    <span style={{ color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, marginRight: 8 }}>{s.station}</span>
                    <span style={{ fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{s.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>No station data</div>
            )
          )}
        </div>
      </div>

      {splitModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }}
          onClick={() => setSplitModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: isMobile ? 'calc(100vw - 32px)' : 440, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {splitModal.status === 'active' ? 'Active Donors' : splitModal.status === 'inactive' ? 'Inactive Donors' : 'Total Donors'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
                  {splitModal.status === 'total'
                    ? `Donated this financial year · ${splitTotal} donor${splitTotal !== 1 ? 's' : ''}`
                    : splitModal.status === 'inactive'
                      ? `No donation in past one month · ${splitTotal} donor${splitTotal !== 1 ? 's' : ''}`
                      : `${donorWindowLabel} · ${splitTotal} donor${splitTotal !== 1 ? 's' : ''}`}
                </div>
              </div>
              <button onClick={() => setSplitModal(null)}
                style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>
                ×
              </button>
            </div>
            <div style={{ overflow: 'auto', padding: 8, flex: 1 }}>
              {splitLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                      <div className="sk" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sk" style={{ height: 9, width: `${52 + (i % 3) * 14}%`, borderRadius: 5, marginBottom: 5 }} />
                        <div className="sk" style={{ height: 7, width: '35%', borderRadius: 5 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : splitDonors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--ink-soft)' }}>No donors</div>
              ) : (
                <>
                  {splitDonors.map(d => (
                    <div key={d.donor_id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                      background: 'var(--bg)', border: '1px solid var(--line)',
                    }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {d.donor_name?.charAt(0) || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.donor_name}</div>
                        <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{d.donor_mobile || '—'}</div>
                      </div>
                    </div>
                  ))}
                  {splitTotal > splitDonors.length && (
                    <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, color: 'var(--ink-soft)' }}>
                      Showing first {splitDonors.length} of {splitTotal}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showCollections && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)' }}
          onClick={() => { setShowCollections(false); setCollectionSearch('') }}>
          <div style={{ background: '#fff', borderRadius: 12, width: isMobile ? 'calc(100vw - 32px)' : 520, maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>My Collections</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
                  {collectionsLoading ? 'Loading…' : `${(collectionsByNgo[selectedCollectionNgo] || []).length} collections`}
                  {collectionsMonthLabel ? ` · ${collectionsMonthLabel}` : ''}
                  {/* The subtotal of the rows actually shown. Served by the same
                      loader the Collected card totals, so on the current month
                      with no NGO filter this must equal the card; if it ever does
                      not, the number on screen is what was collected. */}
                  {!collectionsLoading && selectedCollectionNgo === 'all' && collectionsMonth === 'current' && collectionsData?.total != null && (
                    <span> · {currency(Number(collectionsData.total))} total</span>
                  )}
                  {/* The High Tier slice of that same subtotal (already inside it,
                      never extra), for the same reason the card shows the line. */}
                  {!collectionsLoading && selectedCollectionNgo === 'all' && collectionsMonth === 'current' && Number(collectionsData?.total_high_tier || 0) > 0 && (
                    <span style={{ color: '#7c3aed', fontWeight: 700 }}> · High Tier {currency(Number(collectionsData.total_high_tier))}</span>
                  )}
                </div>
                <button onClick={() => { setShowCollections(false); setSelectedCollectionNgo('all'); setCollectionSearch('') }}
                  style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Month Toggle */}
                <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
                  {[['current', 'This month'], ['prev', 'Last month']].map(([val, lbl]) => (
                    <button
                      key={val}
                      onClick={() => { if (!collectionsLoading && collectionsMonth !== val) openCollections(undefined, val) }}
                      style={{
                        padding: '4px 10px', borderRadius: 4, border: 'none',
                        fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: collectionsLoading ? 'not-allowed' : 'pointer',
                        background: collectionsMonth === val ? 'var(--sage)' : 'transparent',
                        color: collectionsMonth === val ? '#fff' : 'var(--ink-soft)',
                        opacity: collectionsLoading ? 0.6 : 1,
                      }}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                {/* NGO Tabs */}
                <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
                  {['all', ...Object.keys(ngoMap)].map(ngoId => (
                    <button
                      key={ngoId}
                      onClick={() => setSelectedCollectionNgo(ngoId)}
                      style={{
                        padding: '4px 10px', borderRadius: 4, border: 'none',
                        fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                        background: selectedCollectionNgo === ngoId ? 'var(--sage)' : 'transparent',
                        color: selectedCollectionNgo === ngoId ? '#fff' : 'var(--ink-soft)',
                      }}
                    >
                      {ngoId === 'all' ? 'All' : ngoMap[ngoId]}
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>
                        ({collectionsByNgo[ngoId]?.length || 0})
                      </span>
                    </button>
                  ))}
                </div>
                <button onClick={() => { setShowCollections(false); setCollectionSearch('') }} style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            </div>
            <div style={{ padding: '8px 18px 0' }}>
              <input
                value={collectionSearch}
                onChange={e => setCollectionSearch(e.target.value)}
                placeholder="Search donor, mobile or receipt #"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', outline: 'none' }}
              />
            </div>
            <div style={{ overflow: 'auto', padding: 8, flex: 1 }}>
              {collectionsLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                      <div className="sk" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sk" style={{ height: 9, width: `${48 + (i % 3) * 16}%`, borderRadius: 5, marginBottom: 5 }} />
                        <div className="sk" style={{ height: 7, width: '30%', borderRadius: 5 }} />
                      </div>
                      <div className="sk" style={{ width: 56, height: 12, borderRadius: 5, flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              ) : visibleCollections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--ink-soft)' }}>
                  {collectionSearch.trim() ? 'No matching collections' : `No collections in ${collectionsMonthLabel || 'this month'}`}
                </div>
              ) : (
                visibleCollections.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                    background: 'var(--bg)', border: '1px solid var(--line)',
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.is_work_as ? '#f59e0b' : 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {c.donor_name?.charAt(0) || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.donor_name}</span>
                        {c.ngo_name && (
                          <span style={{ fontSize: 8, fontWeight: 700, color: '#6d28d9', background: '#ede9fe', border: '1px solid #ddd6fe', padding: '1px 5px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>{c.ngo_name}</span>
                        )}
                        {c.is_high_tier && (
                          <span title="Collected from High Tier data" style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: '#8b5cf6', padding: '1px 5px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>HIGH TIER</span>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{c.donor_mobile || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)' }}>{currency(c.amount_collected)}</div>
                      {c.receipt_no && (
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#7c3aed' }}>#{c.receipt_no}</div>
                      )}
                      <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{fmtStamp(c.collected_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showMonthlyModal && monthlyDonors.length > 0 && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.4)' }} onClick={() => { localStorage.setItem('monthly_donors_dismissed', monthStr); setShowMonthlyModal(false); }}>
          <div style={{ background:'#fff', borderRadius:12, width: isMobile ? 'calc(100vw - 32px)' : 480, maxHeight:'70vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700 }}>Monthly Recurring Donors</div>
                <div style={{ fontSize:10, color:'var(--ink-soft)' }}>{monthStr} — Donors with 3+ donations history</div>
              </div>
              <button onClick={() => { localStorage.setItem('monthly_donors_dismissed', monthStr); setShowMonthlyModal(false); }}
                style={{ width:28, height:28, border:'none', borderRadius:6, background:'var(--bg)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, lineHeight:1 }}>
                ×
              </button>
            </div>
            <div style={{ overflow:'auto', padding:8, flex:1 }}>
              {monthlyDonors.map(d => (
                <div key={`${d.donor_id}-${d.ngo_id}`} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'8px 12px', marginBottom:4, borderRadius:8,
                  background:'var(--bg)', border:'1px solid var(--line)',
                }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--sage)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                    {d.donor_name?.charAt(0) || '?'}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:600 }}>{d.donor_name}</div>
                    <div style={{ fontSize:9, color:'var(--md-outline)' }}>{d.donor_mobile}{d.donor_city ? ` · ${d.donor_city}` : ''}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:10, fontWeight:600 }}>₹{Number(d.amount).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize:8, color:'var(--md-outline)' }}>{d.donation_count} donations</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* min(320px, 100%): a bare 320px minimum makes two tracks wider than a
          narrow panel, overflowing the page — the horizontal scrollbar then
          appears right under this bottom row (over the notices card). */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14, marginBottom: 14, alignItems: 'stretch', minWidth: 0 }}>
        <RecentNotices limit={5} fill containerStyle={{ marginTop: 0, height: calHeight ? `${calHeight}px` : undefined, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }} />
        <div ref={calRef} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', boxShadow: '0 1px 2px rgba(30,77,59,0.04), 0 6px 18px -10px rgba(30,77,59,0.08)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(135deg, #16a34a 0%, #4ade80 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 15 }}>calendar_month</span>
              </span>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Incentive Calendar</h3>
            </div>
          </div>
          <IncentiveCalendar akiPerDay={akiPerDay} monthStr={monthStr} />
        </div>
      </div>
    </div>
  )
}
