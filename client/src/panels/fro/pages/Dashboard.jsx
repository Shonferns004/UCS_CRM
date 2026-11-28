import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import { ChevronLeft, ChevronRight, Coins, Medal, BarChart3 } from 'lucide-react'
import { getMyDashboard, getMyCollections, getMonthlyDonors, getMyLeadLoans } from '../api/donors'
import { getMyTarget } from '../api/target'
import RecentNotices from '../../../components/RecentNotices'
import { Dropdown } from '../../../components/ui'
import { cacheGet, cacheSet, cacheAge } from '../../../utils/cache'
import { api, getUser } from '../api/auth'
import { istMonthKey, istParts, istDayKey } from '../../../utils/istDate'

const currency = n => n != null ? '₹' + Number(n).toLocaleString('en-IN') : '—'

// Calendar cells are small; a compact figure keeps the full number on one line
// when the board narrows behind the collections drawer.
const compactCurrency = (n) => {
  const v = Number(n) || 0
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr'
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1).replace(/\.0$/, '') + 'L'
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '₹' + v.toLocaleString('en-IN')
}

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

const Icon = ({ children, color }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color || 'var(--ink)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

// Compact quality-of-work tile for the Recent Notices column. Keeps the same
// card language as the rest of the bento (soft tint, strong number, tiny caps).
const MiniMetric = ({ value, label, hint, tone, bg, icon, toggle }) => (
  <div
    style={{
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      height: '100%',
      padding: '9px 11px',
      borderRadius: 14,
      border: `1px solid ${tone}22`,
      background: bg,
      boxShadow: '0 1px 2px rgba(16,24,40,.05)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
      <span
        style={{
          width: 26, height: 26, borderRadius: 9, background: '#fff', color: tone,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(16,24,40,.10)', flexShrink: 0,
        }}
      >
        <Icon color={tone}>{icon}</Icon>
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, color: tone }}>
        {Number(value || 0).toLocaleString('en-IN')}
      </span>
    </div>
    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {label}
    </div>
    {toggle ? (
      <div
        role="group"
        aria-label={`${label} period`}
        style={{
          display: 'flex',
          width: '100%',
          gap: 2,
          padding: 2,
          borderRadius: 999,
          background: `color-mix(in srgb, ${tone} 9%, #fff)`,
          border: `1px solid ${tone}22`,
        }}
      >
        {toggle.options.map(opt => {
          const active = toggle.value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle.onChange(opt.value)}
              aria-pressed={active}
              style={{
                flex: '1 1 0', minWidth: 0, border: 0, borderRadius: 999,
                padding: '3px 0', fontFamily: 'inherit', fontSize: 8.5,
                fontWeight: 800, lineHeight: 1.5, cursor: 'pointer',
                background: active ? tone : 'transparent',
                color: active ? '#fff' : 'var(--ink-soft)',
                boxShadow: active ? '0 1px 3px rgba(16,24,40,.20)' : 'none',
                transition: 'background 140ms ease, color 140ms ease',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    ) : hint && (
      <div style={{ fontSize: 9, color: 'var(--ink-soft)', opacity: .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {hint}
      </div>
    )}
  </div>
)

const pad2 = n => String(n).padStart(2, '0')

const todayYM = () => istMonthKey()

const monthLabelOf = (ym) => {
  // ym: 'YYYY-MM' → 'August 2026'
  const [y, m] = String(ym || '').split('-').map(Number)
  if (!y || !m) return ''
  return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

const prevMonthKey = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number)
  if (!y || !m) return ''
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function IncentiveCalendar({ akiPerDay = [], monthStr, onlyEligible = false }) {
  const [y, m] = (monthStr || '').split('-').map(Number)
  if (!y || !m) return <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No month data</div>

  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDay = new Date(y, m - 1, 1).getDay()
  const akiMap = {}
  akiPerDay.forEach(r => { akiMap[r.date] = r })

  // The highlighted day is the FRO's IST business day, not the browser's local
  // day; a laptop set to another timezone was marking yesterday during the
  // first hours of the IST morning.
  const todayStr = istDayKey()
  const weekday = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${pad2(m)}-${pad2(d)}`
    const rec = akiMap[dateStr]
    const aki = rec ? rec.aki : 0
    cells.push({ d, dateStr, rec, aki, eligible: aki > 0 })
  }

return (
    <div className="fro-aki-cal">
      <div className="fro-aki-week" aria-hidden="true">
        {weekday.map(w => (
          <div key={w} className="fro-aki-weekday">{w}</div>
        ))}
      </div>
      <div className="fro-aki-grid">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="fro-aki-cell is-empty" aria-hidden="true" />
          const isToday = c.dateStr === todayStr
          const hidden = onlyEligible && !c.eligible
          if (hidden) return <div key={i} className="fro-aki-cell is-empty" aria-hidden="true" />
          return (
            <div
              key={i}
              className={`fro-aki-cell${c.eligible ? ' is-eligible' : ''}${isToday ? ' is-today' : ''}`}
              title={c.rec ? `₹${Number(c.rec.collection || 0).toLocaleString('en-IN')} collected · AKI ₹${c.aki}` : `No collection · AKI ₹${c.aki}`}
            >
              <div className="fro-aki-top">
                <span className="fro-aki-day">{c.d}</span>
                {c.eligible && <span className="fro-aki-dot" aria-hidden="true" />}
              </div>
              {c.rec && (
                <>
                  <span className="fro-aki-amount fro-aki-amount-full">{currency(Number(c.rec.collection || 0))}</span>
                  <span className="fro-aki-amount fro-aki-amount-compact">{compactCurrency(Number(c.rec.collection || 0))}</span>
                </>
              )}
              {c.aki > 0 && (
                <>
                  <span className="fro-aki-pill fro-aki-pill-full">AKI {currency(c.aki)}</span>
                  <span className="fro-aki-pill fro-aki-pill-compact">{compactCurrency(c.aki)}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="fro-aki-legend">
        <span className="fro-aki-legend-item"><i className="is-eligible" aria-hidden="true" /> Eligible (AKI earned)</span>
        <span className="fro-aki-legend-item"><i aria-hidden="true" /> No AKI</span>
        <span className="fro-aki-legend-item"><i className="is-today" aria-hidden="true" /> Today</span>
      </div>
    </div>
  )
}

// The dashboard opens two of its own dialogs. They share one shell so the
// header, close affordance, keyboard behaviour and mobile width cannot drift
// apart — and because it portals to <body>, the fixed backdrop is not clipped
// under the mobile topbar by the transformed panel wrapper.
function DashboardModal({ title, subtitle, onClose, toolbar, search, width = 520, drawer = false, children }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const returnFocus = document.activeElement
    dialogRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusables = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(el => el.offsetParent !== null)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus()
    }
  }, [])

  const panel = (
    <div
      ref={dialogRef}
      className={drawer ? 'fro-drawer' : 'fro-modal'}
      role="dialog"
      aria-modal={drawer ? undefined : 'true'}
      aria-label={title}
      tabIndex={-1}
      style={drawer ? undefined : { '--fro-modal-w': `${width}px` }}
    >
      <div className="fro-modal-head">
        <div className="fro-modal-heading">
          <div className="fro-modal-title">{title}</div>
          {subtitle && <div className="fro-modal-sub">{subtitle}</div>}
        </div>
        {!drawer && (
          <button type="button" className="fro-modal-x" onClick={onClose} aria-label="Close dialog">×</button>
        )}
      </div>
      {toolbar && <div className="fro-modal-toolbar">{toolbar}</div>}
      {search && <div className="fro-modal-search">{search}</div>}
      <div className="fro-modal-body">{children}</div>
    </div>
  )

  return createPortal(
    drawer
      ? (
        <>
          <div className="fro-drawer-scrim" onMouseDown={onClose} />
          {panel}
        </>
      )
      : (
        <div
          className="fro-modal-backdrop"
          onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
        >
          {panel}
        </div>
      ),
    document.body,
  )
}

// Loading state mirrors the bento so the real cards do not jump into place
// after the shared generic skeleton. Kept local: the NGO-admin dashboard still
// uses the shared SkeletonDashboard and its own layout.
function DashboardSkeleton() {
  const topCard = (cls, labelWidth) => (
    <div className={`card ${cls}`} style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div className="sk" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
        <div className="sk" style={{ height: 9, width: labelWidth, borderRadius: 5 }} />
      </div>
      <div className="sk" style={{ height: 24, width: '46%', borderRadius: 6 }} />
    </div>
  )
  const tile = (cls) => (
    <div className={`card ${cls}`} style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="sk" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
        <div className="sk" style={{ height: 9, width: '52%', borderRadius: 5 }} />
      </div>
      <div className="sk" style={{ height: 24, width: '100%', marginTop: 10, borderRadius: 6 }} />
      <div style={{ marginTop: 'auto' }}>
        <div className="sk" style={{ height: 24, width: '42%', marginBottom: 7, borderRadius: 6 }} />
        <div className="sk" style={{ height: 9, width: '64%', borderRadius: 5 }} />
      </div>
    </div>
  )
  return (
    <div className="fro-dashboard" aria-busy="true" aria-label="Loading dashboard">
      <div className="fro-dash-head">
        <div>
          <div className="sk" style={{ height: 9, width: 120, marginBottom: 8, borderRadius: 5 }} />
          <div className="sk" style={{ height: 26, width: 154, marginBottom: 9, borderRadius: 6 }} />
          <div className="sk" style={{ height: 10, width: 220, borderRadius: 5 }} />
        </div>
        <div className="fro-dash-head-side">
          <div className="sk" style={{ height: 32, width: 98, borderRadius: 999 }} />
          <div className="sk" style={{ height: 32, width: 84, borderRadius: 999 }} />
        </div>
      </div>
      <div className="fro-dash-bento">
        <div className="fro-dash-top">
          {topCard('dash-target', '58%')}
          {topCard('dash-collected', '62%')}
          {topCard('dash-remaining', '46%')}
          {topCard('dash-active', '64%')}
        </div>
        {tile('dash-connected')}
        {tile('dash-collection')}
        {tile('dash-donors')}
        {tile('dash-assigned')}
        <div className="fro-dash-center">
          <div className="card" style={{ width: '100%', marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div className="sk" style={{ width: 28, height: 28, borderRadius: 8 }} />
              <div className="sk" style={{ height: 12, width: 140, borderRadius: 5 }} />
            </div>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0' }}>
                <div className="sk" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="sk" style={{ height: 9, width: `${55 + (i % 3) * 10}%`, marginBottom: 6, borderRadius: 5 }} />
                  <div className="sk" style={{ height: 8, width: '40%', borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card fro-dash-calendar" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div className="sk" style={{ width: 28, height: 28, borderRadius: 8 }} />
            <div className="sk" style={{ height: 12, width: 150, borderRadius: 5 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="sk" style={{ height: 44, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// How long a cached dashboard payload counts as fresh enough to skip refetching.
// Short by design: the numbers only move when the FRO themselves act, but a
// save must still show up promptly, so this only covers the bounce between
// Dashboard and My Leads — not a genuine reload.
const DASH_FRESH_MS = 60 * 1000

export default function Dashboard({ tempStations = [], onOpenIncentive, onOpenLeaderboard, onOpenData }) {
  // Scoped to the signed-in worker, and resolved per render rather than at
  // module load. A shared global key would hand one FRO another's dashboard
  // numbers, and skipping the refetch would keep that wrong page on screen for a
  // full minute — nothing else clears this store, including logout.
  const CACHE_KEY = `fro_dashboard:${getUser()?.id ?? 'anon'}`
  const cached = cacheGet(CACHE_KEY)
  const cachedAge = cacheAge(CACHE_KEY)
  // Lookback window for the active/inactive donor split. My Leads treats a
  // donor as active for 12 months, so the dashboard opens on that window.
  const [donorView, setDonorView] = useState('12')
  const [donorNgoId, setDonorNgoId] = useState('')
  // Live lead loans (in = borrowed work from another station, out = this
  // station's leads currently with someone else). Shown here on the Dashboard
  // only; the working lists stay focused on donor rows.
  const [myLoans, setMyLoans] = useState([])
  useEffect(() => {
    let cancelled = false
    getMyLeadLoans()
      .then(list => { if (!cancelled) setMyLoans(Array.isArray(list) ? list : []) })
      .catch(() => { if (!cancelled) setMyLoans([]) })
    return () => { cancelled = true }
  }, [])
  // Fresh only for the window it was stored with — monthly counts differ
  // from quarterly/yearly ones, so a cached yearly payload cannot back the
  // monthly view (or vice versa).
  const dashIsFresh = !!cached && (cachedAge ?? Infinity) < DASH_FRESH_MS
    && cached.donorView === donorView
    && (cached.donorNgoId || '') === donorNgoId
  const [dashData, setDashData] = useState(cached?.dash || null)
  const [targetData, setTargetData] = useState(cached?.target || null)
  const [loading, setLoading] = useState(!cached)
  // A failed read used to fall through to an all-zero board, which looks like a
  // real day's work. Keep the failure visible and offer a retry instead.
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [monthlyDonors, setMonthlyDonors] = useState([])
  const [showMonthlyModal, setShowMonthlyModal] = useState(false)
  const [assignedView, setAssignedView] = useState('total')
  const [showCollections, setShowCollections] = useState(false)
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [collectionsError, setCollectionsError] = useState(false)
  const [selectedCollectionNgo, setSelectedCollectionNgo] = useState('all')
  const [collectionSearch, setCollectionSearch] = useState('')
  const [collectionsByNgo, setCollectionsByNgo] = useState({})
  const [ngoMap, setNgoMap] = useState({})
  const [collectionsMonth, setCollectionsMonth] = useState('current')
  const [collectionsMonthLabel, setCollectionsMonthLabel] = useState('')
  const [connectedView, setConnectedView] = useState('daily')
  const [donationView, setDonationView] = useState('today')
  const [reactivationView, setReactivationView] = useState('today')
  const [categoryUpgradeView, setCategoryUpgradeView] = useState('month')
  // The calendar can step back through earlier months without changing the
  // current-month KPIs at the top of the board.
  const [calendarMonth, setCalendarMonth] = useState(istMonthKey())
  const [calendarTarget, setCalendarTarget] = useState(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState(false)

  const today = new Date()
  const istToday = istParts(today)
  const day = istToday.day
  const monthStr = istMonthKey(today)
  const [colYear, colMonth] = monthStr.split('-').map(Number)
  const collectionMonthOptions = Array.from({ length: colMonth }, (_, i) => ({
    value: `${colYear}-${String(i + 1).padStart(2, '0')}`,
    label: new Date(colYear, i, 1).toLocaleDateString('en-GB', { month: 'short' }),
  }))
  const collectionMonthKey = collectionsMonth === 'current'
    ? monthStr
    : collectionsMonth === 'prev'
      ? prevMonthKey(monthStr)
      : collectionsMonth
  const shiftCalendarMonth = (delta) => {
    const [y, m] = calendarMonth.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    const next = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
    if (next > monthStr) return
    setCalendarMonth(next)
  }
  const isMonthlyPopupSeason = day >= 1 && day <= 3

  useEffect(() => {
    let cancelled = false
    const safeSet = (setter, value) => { if (!cancelled) setter(value) }
    const fail = (err) => {
      console.error('API error:', err.message)
      safeSet(setLoadError, true)
    }
    safeSet(setLoadError, false)

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
      const dashboardRequest = getMyDashboard(donorView, donorNgoId).catch(fail)
      const targetRequest = getMyTarget().catch(fail)

      dashboardRequest.then(data => {
        // A failed refresh must not wipe the numbers already on screen.
        if (data) safeSet(setDashData, data)
        safeSet(setLoading, false)
      })

      targetRequest.then(data => { if (data) safeSet(setTargetData, data) })

      Promise.all([dashboardRequest, targetRequest]).then(([dash, target]) => {
        // Only a complete pair is worth caching; a partial payload would keep
        // one half of the board wrong for the whole freshness window.
        if (dash && target) cacheSet(CACHE_KEY, { dash, target, donorView, donorNgoId }, 5 * 60 * 1000)
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
  }, [reloadKey])

  const retryDashboard = () => {
    setLoadError(false)
    if (!dashData && !targetData) setLoading(true)
    setReloadKey(key => key + 1)
  }

  // The mount fetch covers the initial window; switching the active-donor
  // toggle re-requests only the dashboard payload (target, follow-ups and lead
  // stats are window-independent).
  const donorFilterRef = useRef(`${donorView}:${donorNgoId}`)
  useEffect(() => {
    const key = `${donorView}:${donorNgoId}`
    if (donorFilterRef.current === key) return
    donorFilterRef.current = key
    let cancelled = false
    getMyDashboard(donorView, donorNgoId)
      .then(data => { if (!cancelled && data) setDashData(data) })
      .catch((err) => { console.error('API error:', err.message) })
    return () => { cancelled = true }
  }, [donorView, donorNgoId])

  // Older calendar months come from the same target endpoint with ?month=.
  // The current month keeps using the payload already on the board.
  useEffect(() => {
    if (calendarMonth === monthStr) {
      setCalendarTarget(null)
      setCalendarLoading(false)
      setCalendarError(false)
      return
    }
    let cancelled = false
    setCalendarTarget(null)
    setCalendarLoading(true)
    setCalendarError(false)
    getMyTarget(calendarMonth)
      .then(data => { if (!cancelled) setCalendarTarget(data || null) })
      .catch((err) => {
        console.error('API error:', err.message)
        if (!cancelled) setCalendarError(true)
      })
      .finally(() => { if (!cancelled) setCalendarLoading(false) })
    return () => { cancelled = true }
  }, [calendarMonth, monthStr])

  const openCollections = async (ngoId, month) => {
    const isToggle = month !== undefined
    const targetMonth = isToggle ? month : collectionsMonth
    if (targetMonth !== collectionsMonth) setCollectionsMonth(targetMonth)
    if (!isToggle) {
      setSelectedCollectionNgo('all')
      setCollectionSearch('')
    }
    setShowCollections(true)
    setCollectionsLoading(true)
    setCollectionsError(false)
    if (ngoId !== undefined) setSelectedCollectionNgo(String(ngoId))
    // Label the window we actually requested. The server used to echo the
    // previous month (midnight IST is the prior day in UTC), which put
    // "October 2026" over November's rows; deriving it here keeps the title and
    // the Last-month tab correct even before that backend fix is deployed.
    const labelMonth = targetMonth === 'current'
      ? todayYM()
      : targetMonth === 'prev'
        ? prevMonthKey(todayYM())
        : targetMonth
    setCollectionsMonthLabel(monthLabelOf(labelMonth))
    try {
      const res = await getMyCollections(ngoId, targetMonth)
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
    } catch (err) {
      console.error('Error:', err.message)
      setCollectionsByNgo({ all: [] })
      setNgoMap({})
      setCollectionsError(true)
    } finally {
      setCollectionsLoading(false)
    }
  }

  const dashRef = useRef(null)
  useEffect(() => {
    if (loading || !dashRef.current) return
    // The error-only state has no bento; GSAP would otherwise warn about a
    // missing target on every failed load.
    if (!dashRef.current.querySelector('.fro-dash-bento')) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.from('.fro-dash-bento .card, .fro-dash-center', {
        autoAlpha: 0,
        y: 14,
        duration: 0.5,
        ease: 'power3.out',
        stagger: 0.055,
        clearProps: 'transform',
      })
    }, dashRef.current)
    return () => ctx.revert()
  }, [loading])

  if (loading) return <DashboardSkeleton />

  const ts = targetData || {}
  const me = getUser()
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
  const ngoOptions = ds.assignedData?.byNgo || []
  const target = ts.target || ds.target || 0
  const collected = ts.collected ?? ds.collected ?? 0
  const calendarSource = calendarMonth === monthStr ? ts : (calendarTarget || {})
  const akiPerDay = calendarSource.incentive?.akiPerDay || []
  const calendarIncentive = Number(calendarSource.incentive?.totalCollectionAKI || 0)
  const displayCollected = collected
  const remaining = Math.max(0, target - displayCollected)
  const hasAnyData = !!dashData || !!targetData

  const cq = collectionSearch.trim().toLowerCase()
  const visibleCollections = (collectionsByNgo[selectedCollectionNgo] || []).filter(c => !cq ||
    (c.donor_name || '').toLowerCase().includes(cq) ||
    String(c.donor_mobile || '').includes(cq) ||
    String(c.receipt_no || '').includes(cq))
  const closeCollections = () => { setShowCollections(false); setCollectionSearch('') }
  const retryCollections = () => openCollections(
    selectedCollectionNgo === 'all' ? undefined : selectedCollectionNgo,
    collectionsMonth,
  )
  const dismissMonthly = () => {
    localStorage.setItem('monthly_donors_dismissed', monthStr)
    setShowMonthlyModal(false)
  }


return (
    <div ref={dashRef} className={`fro-dashboard${showCollections ? ' is-drawer-open' : ''}`}>
      <div className="fro-dash-head">
        <div>
          <div className="fro-dash-kicker">Field officer workspace</div>
          <h1 className="fro-dash-title">Dashboard</h1>
          <p className="fro-dash-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>Today at a glance{me?.name ? ` · ${me.name}` : ''}</span>
            {tempStations.length > 0 && (
              <span
                title={tempStations.map(s => `${s.station}${s.ngo_name ? ` · ${s.ngo_name}` : ''}`).join(', ') + ' — temporary access; donor ownership stays with the permanent FRO.'}
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 1,
                  marginLeft: 8,
                  marginTop: 2,
                  padding: '3px 9px',
                  border: '2px dashed #1d4ed8',
                  borderRadius: 7,
                  background: 'rgba(239,246,255,.78)',
                  color: '#1e40af',
                  lineHeight: 1.15,
                  transform: 'rotate(-6deg)',
                  transformOrigin: 'center',
                  outline: '1px solid rgba(29,78,216,.26)',
                  outlineOffset: 2,
                  boxShadow: 'inset 0 0 0 1px rgba(29,78,216,.14)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                  Temporary access
                </span>
                {tempStations.map((s) => {
                  const expiry = s.temp_expires_at
                    ? new Date(s.temp_expires_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <span key={`${s.ngo_id || ''}|${s.station}`} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.02em' }}>
                      {s.station}{expiry ? ` · until ${expiry} IST` : ''}
                    </span>
                  );
                })}
              </span>
            )}
          </p>
        </div>
        <div className="fro-dash-head-side">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 2 }}>
            {[
              { label: 'Incentive', Icon: Coins, onClick: onOpenIncentive, color: '#b45309' },
              { label: 'Leaderboard', Icon: Medal, onClick: onOpenLeaderboard, color: '#7c3aed' },
              { label: 'Data', Icon: BarChart3, onClick: onOpenData, color: '#2563eb' },
            ].map(({ label, Icon: HeadIcon, onClick, color }) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => onClick?.()}
                style={{
                  width: 30, height: 30, padding: 0, borderRadius: 9,
                  border: '1px solid var(--line)', background: '#fff', color,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,.05)',
                }}
              >
                <HeadIcon size={15} strokeWidth={2} />
              </button>
            ))}
          </div>
          {ds.is_active !== undefined && (
            <span className={`fro-status-pill${ds.is_punched_in ? ' is-live' : ''}`}>
              <span className="fro-status-dot" />
              {ds.is_active ? (ds.is_punched_in ? 'Punched in' : 'Not punched') : 'Inactive'}
            </span>
          )}
          <span className="fro-date-pill">
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}
          </span>
        </div>
      </div>
      {myLoans.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {myLoans.filter(l => l.direction === 'in').map(l => (
            <div key={`in-${l.id}`} style={{ padding: '8px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>swap_horiz</span>
              <span>
                <b>{l.item_count} lead{l.item_count === 1 ? '' : 's'}</b> lent from <b>{l.source_station}</b>
                {l.counterpart_name ? ` (${l.counterpart_name})` : ''} until {new Date(l.expires_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}. Your calls are credited to you.
              </span>
            </div>
          ))}
          {myLoans.filter(l => l.direction === 'out').map(l => (
            <div key={`out-${l.id}`} style={{ padding: '8px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>swap_horiz</span>
              <span>
                <b>{l.item_count} lead{l.item_count === 1 ? '' : 's'}</b> are temporarily with <b>{l.target_station}</b>
                {l.counterpart_name ? ` (${l.counterpart_name})` : ''} until {new Date(l.expires_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}. They return automatically.
              </span>
            </div>
          ))}
        </div>
      )}

      {loadError && !hasAnyData ? (
        <div className="card" role="alert" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, minHeight: 320, padding: 32, textAlign: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 34, color: 'var(--ink-soft)' }} aria-hidden="true">cloud_off</span>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Couldn’t load your dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 380 }}>
            Check your connection and try again.
          </div>
          <button type="button" className="btn btn-primary" onClick={retryDashboard} style={{ marginTop: 4 }}>
            Try again
          </button>
        </div>
      ) : (
      <div className="fro-dash-bento">
      <div className="fro-dash-top">
        <div className="card fro-kpi dash-target" style={{ marginBottom: 0 }}>
          <div className="fro-kpi-head">
            <span className="fro-kpi-label">Target</span>
          </div>
          <span className="fro-kpi-value" style={{ color: 'var(--ink)' }}>{currency(target)}</span>
        </div>

        <button
          type="button"
          className="card fro-kpi dash-collected"
          onClick={() => openCollections()}
          aria-label={`View collections${ts.month ? ` for ${monthLabel(ts.month)}` : ''}: ${currency(displayCollected)} collected`}
          style={{ position: 'relative', marginBottom: 0, width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}
        >
          <div className="fro-kpi-head">
            <span className="fro-kpi-label">Collected</span>
          </div>
          <div className="fro-kpi-value-row">
            <span className="fro-kpi-value" style={{ color: 'var(--sage)' }}>{currency(displayCollected)}</span>
            <ChevronRight size={18} color="var(--sage)" style={{ flexShrink: 0 }} />
          </div>
        </button>

        <div className="card fro-kpi dash-remaining" style={{ marginBottom: 0 }}>
          <div className="fro-kpi-head">
            <span className="fro-kpi-label">Remaining</span>
          </div>
          <span className="fro-kpi-value" style={{ color: remaining > 0 ? '#e53e3e' : 'var(--sage)' }}>{currency(remaining)}</span>
        </div>

        <div className="card fro-kpi dash-active" style={{ marginBottom: 0 }}>
          <div className="fro-kpi-head">
            <span className="fro-kpi-label" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
              Category
            </span>
            <Dropdown
              className="fro-cat-window"
              value={donorView}
              onChange={({ target }) => setDonorView(target.value)}
              options={[
                { value: '1', label: '1 Month' },
                { value: '2', label: '2 Months' },
                { value: '3', label: '3 Months' },
                { value: '6', label: '6 Months' },
                { value: '8', label: '8 Months' },
                { value: '12', label: '1 Year' },
              ]}
            />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#8b5cf6', marginTop: 'auto' }}>
            {Number(ds.active_donors ?? 0).toLocaleString('en-IN')}
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', marginLeft: 4 }}>donors</span>
          </div>
        </div>
      </div>

      {/* Flex, not grid: the cards need UNEVEN widths (Incentive compact,
          Active Donors roomy for its pills) while still wrapping as a unit
          when the panel gets narrow. Grow factors share the spare width. */}
      <div className="fro-dash-row">
        <div className="card dash-connected" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1 1 190px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color={connectedView === 'daily' ? '#3b82f6' : 'var(--sage)'}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </Icon>
            <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', flex: 1 }}>Connected</span>
          </div>
          <div className="fro-seg" role="group" aria-label="Connected range">
            {[['daily', 'Daily'], ['month', 'Monthly']].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setConnectedView(v)}
                aria-pressed={connectedView === v}
                className={`fro-seg-btn${connectedView === v ? ' is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: connectedView === 'daily' ? '#3b82f6' : 'var(--sage)' }}>
              {connectedView === 'daily' ? (ds.daily_connected ?? 0) : (ds.monthly_connected ?? stats.contacted ?? 0)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
              {connectedView === 'daily' ? 'Donors connected today' : 'Donors connected this month'}
            </div>
          </div>
        </div>

        <div className="card dash-collection" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1 1 190px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color="#3b82f6">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="6" x2="21" y2="6"/>
            </Icon>
            <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', flex: 1 }}>Collection</span>
          </div>
          <div className="fro-seg" role="group" aria-label="Collection range">
            {[['today', 'Today'], ['month', 'Monthly']].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setDonationView(v)}
                aria-pressed={donationView === v}
                className={`fro-seg-btn${donationView === v ? ' is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#3b82f6' }}>
              {currency(donationView === 'today' ? (ds.daily_donations ?? 0) : collected)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
              {donationView === 'today'
                ? `${ds.daily_donor_count ?? 0} donors today`
                : `${ds.monthly_donor_count ?? 0} donors this month`}
            </div>
          </div>
        </div>

        {/* Smallest of the row — just an icon, one number and a caption. */}
        <div className="card dash-donors" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1 1 190px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color="#8b5cf6">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </Icon>
            <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', flex: 1 }}>Donors</span>
          </div>
          {ngoOptions.length > 0 && (
            <div className="fro-seg fro-donor-tabs" role="tablist" aria-label="Filter donors by allotted NGO">
              {[{ ngo_id: '', ngo_name: 'All' }, ...ngoOptions].map(n => (
                <button
                  key={n.ngo_id || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={donorNgoId === n.ngo_id}
                  title={n.ngo_name}
                  onClick={() => setDonorNgoId(n.ngo_id)}
                  className={`fro-seg-btn${donorNgoId === n.ngo_id ? ' is-active' : ''}`}
                >
                  {n.ngo_name}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#8b5cf6' }}>
                {Number(ds.active_donors ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Active</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#f97316' }}>
                {Number(ds.inactive_donors ?? 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Inactive</div>
            </div>
          </div>
        </div>

        <div className="card dash-assigned" style={{ marginBottom: 0, padding: '10px 14px', overflow: 'hidden', flex: '1 1 190px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon color="var(--ink)">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>
            </Icon>
            <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', flex: 1 }}>Assigned Data</span>
          </div>
          <div className="fro-seg" role="group" aria-label="Assigned data grouping">
            {[['total', 'Total'], ['ngo', 'NGO'], ['station', 'Station']].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setAssignedView(v)}
                aria-pressed={assignedView === v}
                className={`fro-seg-btn${assignedView === v ? ' is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 'auto' }}>
            {assignedView === 'total' && (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                  {Number(stats.total ?? ts.stats?.total ?? 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Total donors assigned</div>
              </>
            )}
            {assignedView === 'ngo' && (
              ds.assignedData?.byNgo?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 96, overflowY: 'auto' }}>
                  {ds.assignedData.byNgo.map(n => (
                    <div key={n.ngo_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, padding: '1px 0', minWidth: 0 }}>
                      <span style={{ color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, marginRight: 8 }}>{n.ngo_name}</span>
                      <span style={{ fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{Number(n.count || 0).toLocaleString('en-IN')}</span>
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
                      <span style={{ fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{Number(s.count || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>No station data</div>
              )
            )}
          </div>
        </div>
      </div>

        <div className="fro-dash-center" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
            <RecentNotices showAll fill containerStyle={{ marginTop: 0, height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: 16, border: 'none', flex: 1 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, flex: '0 0 auto', height: 92 }}>
            <MiniMetric
              value={reactivationView === 'today'
                ? ds?.reactivations?.inactive_to_active_today
                : ds?.reactivations?.inactive_to_active_monthly}
              label="Inactive → Active"
              tone="#15803d"
              bg="#f0fdf4"
              toggle={{
                value: reactivationView,
                onChange: setReactivationView,
                options: [{ value: 'today', label: 'Today' }, { value: 'month', label: 'Month' }],
              }}
              icon={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m17 11 2 2 4-4" /></>}
            />
            <MiniMetric
              value={categoryUpgradeView === 'today'
                ? ds?.category_upgrades?.today
                : ds?.category_upgrades?.monthly}
              label="Category Upgrades"
              tone="#b45309"
              bg="#fffbeb"
              toggle={{
                value: categoryUpgradeView,
                onChange: setCategoryUpgradeView,
                options: [{ value: 'today', label: 'Today' }, { value: 'month', label: 'Month' }],
              }}
              icon={<><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>}
            />
          </div>
        </div>

        <div className={`card fro-dash-calendar${showCollections ? ' is-compact' : ''}`}>
          <div className="fro-cal-head">
            <div className="fro-cal-title">
              <span className="fro-cal-icon">
                <span className="material-symbols-outlined">calendar_month</span>
              </span>
              <div>
                <h3>Incentive Calendar</h3>
                <p>Daily collection · AKI earning days</p>
              </div>
            </div>
            <div className="fro-cal-meta">
              <div className="fro-cal-nav">
                <button
                  type="button"
                  className="fro-cal-arrow"
                  onClick={() => shiftCalendarMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="fro-cal-count">
                  {calendarLoading
                    ? 'Loading…'
                    : calendarError
                      ? 'Couldn’t load'
                      : `${currency(calendarIncentive)} incentive`}
                </span>
                <button
                  type="button"
                  className="fro-cal-arrow"
                  onClick={() => shiftCalendarMonth(1)}
                  disabled={calendarMonth === monthStr}
                  aria-label="Next month"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
          <IncentiveCalendar akiPerDay={akiPerDay} monthStr={calendarMonth} />
        </div>
      </div>
      )}

      {showCollections && (
        <DashboardModal
          title="My Collections"
          onClose={closeCollections}
          drawer
          width={520}
          toolbar={(
            <>
              <div className="fro-filter">
                <span>Month</span>
                <Dropdown
                  className="fro-dd"
                  value={collectionMonthKey}
                  onChange={({ target }) => {
                    const val = target.value
                    if (!collectionsLoading && collectionMonthKey !== val) openCollections(undefined, val)
                  }}
                  options={collectionMonthOptions}
                />
              </div>
              <div className="fro-filter">
                <span>NGO</span>
                <Dropdown
                  className="fro-dd"
                  value={selectedCollectionNgo}
                  onChange={({ target }) => setSelectedCollectionNgo(target.value)}
                  options={[
                    { value: 'all', label: 'All' },
                    ...Object.keys(ngoMap).map(id => ({ value: id, label: ngoMap[id] || 'Unknown' })),
                  ]}
                />
              </div>
              <div className="fro-filter fro-filter-search">
                <span>Search</span>
                <input
                  className="fro-modal-search-input"
                  type="search"
                  value={collectionSearch}
                  onChange={e => setCollectionSearch(e.target.value)}
                  placeholder="Search"
                  aria-label="Search collections by donor, mobile or receipt number"
                />
              </div>
            </>
          )}
        >
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
          ) : collectionsError ? (
            <div style={{ textAlign: 'center', padding: '26px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Couldn’t load collections</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                Check your connection and try again.
              </div>
              <button type="button" className="btn btn-primary" onClick={retryCollections} style={{ marginTop: 10, fontSize: 11 }}>
                Try again
              </button>
            </div>
          ) : visibleCollections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--ink-soft)' }}>
              {collectionSearch.trim() ? 'No matching collections' : `No collections in ${collectionsMonthLabel || 'this month'}`}
            </div>
          ) : (
            visibleCollections.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                    background: 'var(--bg)',
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.is_work_as ? '#f59e0b' : 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {c.donor_name?.charAt(0) || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.donor_name}</span>
                        {c.ngo_name && (
                          <span style={{ fontSize: 8, fontWeight: 700, color: '#3f4a36', background: '#f0f4ea', padding: '1px 5px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>{c.ngo_name}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{c.donor_mobile || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)' }}>{currency(c.amount_collected)}</div>
                      {c.receipt_no && (
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#b45309' }}>#{c.receipt_no}</div>
                      )}
                      <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{fmtStamp(c.collected_at)}</div>
                    </div>
                  </div>
                ))
          )}
        </DashboardModal>
      )}

      {showMonthlyModal && monthlyDonors.length > 0 && (
        <DashboardModal
          title="Monthly Recurring Donors"
          subtitle={`${monthLabelOf(monthStr) || monthStr} · Donors with 3 or more donations in their history`}
          onClose={dismissMonthly}
          width={480}
        >
          {monthlyDonors.map(d => (
            <div key={`${d.donor_id}-${d.ngo_id}`} style={{
              display:'flex', alignItems:'center', gap:10, padding:'8px 12px', marginBottom:4, borderRadius:8,
              background:'var(--bg)', border:'1px solid var(--line)',
            }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--sage)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                {d.donor_name?.charAt(0) || '?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.donor_name}</div>
                <div style={{ fontSize:9, color:'var(--ink-soft)' }}>{d.donor_mobile}{d.donor_city ? ` · ${d.donor_city}` : ''}</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:10, fontWeight:600 }}>₹{Number(d.amount).toLocaleString('en-IN')}</div>
                <div style={{ fontSize:8, color:'var(--ink-soft)' }}>{d.donation_count} donations</div>
              </div>
            </div>
          ))}
        </DashboardModal>
      )}

    </div>
  )
}
