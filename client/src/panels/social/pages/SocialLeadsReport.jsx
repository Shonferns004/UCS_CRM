import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { fetchSocialLeadsOverview } from '../../../api/socialLeads'
import './socialLeads.css'

// Social Media panel → Leads Report.
//
// A LeadPulse-style overview of the leads the digital team brings in (Meta lead
// ads, Google lead forms, WhatsApp bulk replies, bulk email, LinkedIn). Every
// number comes from the backend aggregation, so the KPIs, charts and tables can
// never disagree with each other. Spend / CPL appear only when a Meta ad
// account is configured; the lead counts work regardless.

const num = (n) => Number(n || 0).toLocaleString('en-IN')
const pct = (n) => `${Math.round((Number(n) || 0) * 1000) / 10}%`
const money = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const safe = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n) : d)

const SOURCE_COLOR = {
  meta: '#2563eb',
  google: '#d97706',
  whatsapp: '#059669',
  email: '#7c3aed',
  linkedin: '#0891b2',
}
const SOURCE_LABEL = {
  meta: 'Meta',
  google: 'Google',
  whatsapp: 'WhatsApp',
  email: 'Email replies',
  linkedin: 'LinkedIn',
}
const TIER_OPTIONS = [
  { value: '', label: 'All tiers' },
  { value: 'interested', label: 'Hot / Interested' },
  { value: 'review', label: 'Review' },
  { value: 'low', label: 'Low / Standard' },
]

function KpiIcon({ color, bg, children }) {
  return <span className="sl-kpi-icon" style={{ background: bg, color }}>{children}</span>
}

export default function SocialLeadsReport() {
  const [days, setDays] = useState('30')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [source, setSource] = useState('')
  const [ngo, setNgo] = useState('')
  const [platform, setPlatform] = useState('')
  const [tier, setTier] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    setError('')
    const params = { source, platform, tier, q: debounced }
    if (ngo) params.ngo = ngo
    // An explicit from/to range wins server-side; only send `days` when the
    // range is not fully set so the rolling window stays the default.
    if (from && to) {
      params.from = from
      params.to = to
    } else {
      params.days = days
    }
    fetchSocialLeadsOverview(params)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setError(e?.message || 'Could not load the leads overview.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days, from, to, source, ngo, platform, tier, debounced])

  useEffect(() => load(), [load])
  useEffect(() => { setPage(1) }, [days, from, to, source, ngo, platform, tier, debounced])

  const resetFilters = () => {
    setDays('30')
    setFrom('')
    setTo('')
    setSource('')
    setNgo('')
    setPlatform('')
    setTier('')
    setSearch('')
  }

  const totals = data?.totals || {}
  const series = data?.series || []
  const bySource = data?.by_source || []
  const byCampaign = data?.by_campaign || []
  const byForm = data?.by_form || []
  const byNgo = data?.by_ngo || []
  const recent = data?.recent || []
  const adsMeta = data?.ads?.meta || {}
  const funnel = adsMeta?.funnel || null
  const insights = adsMeta?.totals || null

  const sourceMax = Math.max(1, ...bySource.map((s) => s.leads))
  const qualityTotal = Math.max(1, safe(totals.interested) + safe(totals.review) + safe(totals.low) + safe(totals.unscored))
  const placedRate = totals.leads ? safe(totals.placed) / totals.leads : 0
  const custom = Boolean(data?.custom)

  const pageCount = Math.max(1, Math.ceil(recent.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(
    () => recent.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [recent, safePage],
  )

  const funnelSteps = funnel
    ? [
      { label: 'Impressions served', value: funnel.impressions || 0, color: '#93c5fd' },
      { label: 'Ad clicks', value: funnel.clicks || 0, color: '#60a5fa' },
      { label: 'Meta lead submits', value: funnel.meta_leads || 0, color: '#3b82f6' },
      { label: 'CRM ingested', value: funnel.crm_leads || totals.leads || 0, color: '#2563eb' },
      { label: 'Placed in station', value: funnel.placed_leads || totals.placed || 0, color: '#4f46e5' },
    ]
    : [
      { label: 'Captured leads', value: totals.leads || 0, color: '#3b82f6' },
      { label: 'Interested (hot)', value: totals.hot || 0, color: '#059669' },
      { label: 'Placed in station', value: totals.placed || 0, color: '#4f46e5' },
    ]
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value))

  const exportCsv = () => {
    const header = ['Date', 'Name', 'Phone', 'Email', 'Source', 'Platform', 'Campaign', 'Form', 'NGO', 'Status', 'Tier', 'Placed']
    const rows = recent.map((r) => [
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
      r.name, r.phone, r.email, r.source, r.platform, r.campaign_name, r.form_name, r.ngo, r.status, r.label, r.placed ? 'yes' : 'no',
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `social-leads-${data?.from || ''}_${data?.to || ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !data) {
    return <div className="social-leads"><div className="sl-card sl-empty">Loading leads overview…</div></div>
  }

  return (
    <div className="social-leads">
      {/* ── Filter toolbar ─────────────────────────────────────────── */}
      <div className="sl-toolbar">
        <label className="sl-field">
          <span>Period</span>
          <select
            className="sl-select"
            value={from && to ? 'custom' : days}
            onChange={(e) => { setDays(e.target.value); setFrom(''); setTo('') }}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            {from && to && <option value="custom">Custom range</option>}
          </select>
        </label>

        <label className="sl-field">
          <span>From</span>
          <input className="sl-input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>

        <label className="sl-field">
          <span>To</span>
          <input className="sl-input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>

        <label className="sl-field">
          <span>Source</span>
          <select className="sl-select" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {(data?.sources || []).map((s) => (
              <option key={s.source} value={s.source}>{SOURCE_LABEL[s.key] || s.source}</option>
            ))}
          </select>
        </label>

        <label className="sl-field">
          <span>NGO</span>
          <select className="sl-select" value={ngo} onChange={(e) => setNgo(e.target.value)}>
            <option value="">All NGOs</option>
            {(data?.ngo_options || [
              { ngo: 'BSCT' }, { ngo: 'AFLF' }, { ngo: 'MANN' }, { ngo: 'Unmapped' },
            ]).map((o) => (
              <option key={o.ngo} value={o.ngo}>
                {o.ngo}{typeof o.count === 'number' ? ` (${o.count})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="sl-field">
          <span>Platform</span>
          <select className="sl-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All</option>
            <option value="fb">Facebook</option>
            <option value="ig">Instagram</option>
          </select>
        </label>

        <label className="sl-field">
          <span>Intent tier</span>
          <select className="sl-select" value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>

        <label className="sl-field sl-search">
          <span>Search</span>
          <input
            className="sl-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, email or campaign"
          />
        </label>

        <div className="sl-toolbar-actions">
          <button className="sl-btn" type="button" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button className="sl-btn" type="button" onClick={resetFilters}>Reset</button>
          <button className="sl-btn sl-btn-primary" type="button" onClick={exportCsv} disabled={!recent.length}>Export CSV</button>
        </div>
      </div>

      {error && <div className="sl-error">{error}</div>}

      {/* ── KPI row ────────────────────────────────────────────────── */}
      <div className="sl-kpis">
        <div className="sl-kpi">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Total leads</span>
            <KpiIcon color="#4f46e5" bg="#eef2ff">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </KpiIcon>
          </div>
          <div className="sl-kpi-value">
            {num(totals.leads)}
            {totals.change_pct != null && (
              <span className={`sl-delta ${totals.change_pct > 0 ? 'up' : totals.change_pct < 0 ? 'down' : 'flat'}`}>
                {totals.change_pct > 0 ? '▲' : totals.change_pct < 0 ? '▼' : '■'} {Math.abs(totals.change_pct)}%
              </span>
            )}
          </div>
          <div className="sl-kpi-sub">
            <span>{custom ? `${num(totals.range_end)} on ${fmtDate(data?.to)}` : `${num(totals.today)} today`}</span>
            <span>vs {num(totals.previous)} prev</span>
          </div>
        </div>

        <div className="sl-kpi">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Hot / interested</span>
            <KpiIcon color="#b45309" bg="#fffbeb">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>
            </KpiIcon>
          </div>
          <div className="sl-kpi-value">{num(totals.hot)}</div>
          <div className="sl-kpi-sub">
            <span>Avg score {totals.avg_score || 0}</span>
            <span>{num(totals.scored)} scored</span>
          </div>
        </div>

        <div className="sl-kpi">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Station placed</span>
            <KpiIcon color="#0891b2" bg="#ecfeff">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
            </KpiIcon>
          </div>
          <div className="sl-kpi-value">{num(totals.placed)}</div>
          <div className="sl-kpi-sub">
            <span>{pct(placedRate)} placement</span>
            <span>{num(totals.mapped)} mapped</span>
          </div>
        </div>

        <div className="sl-kpi">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Social split</span>
            <KpiIcon color="#7c3aed" bg="#f5f3ff">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9" /></svg>
            </KpiIcon>
          </div>
          <div className="sl-kpi-value">
            <span style={{ color: '#2563eb' }}>{num(totals.facebook)}</span>
            <small>FB</small>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ color: '#db2777' }}>{num(totals.instagram)}</span>
            <small>IG</small>
          </div>
          <div className="sl-kpi-sub">
            <span>{num(totals.google)} Google</span>
            <span>{num(totals.unscored)} unscored</span>
          </div>
        </div>

        <div className="sl-kpi">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Meta spend / CPL</span>
            <KpiIcon color="#059669" bg="#ecfdf5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </KpiIcon>
          </div>
          <div className="sl-kpi-value">{insights ? money(insights.cpl) : '—'}</div>
          <div className="sl-kpi-sub">
            {insights
              ? <><span>Spend {money(insights.spend)}</span><span>{num(insights.clicks)} clicks</span></>
              : <span>{custom ? 'Custom range: rolling-period metric' : 'Connect a Meta ad account'}</span>}
          </div>
        </div>

        <div className="sl-kpi">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Lead quality</span>
            <KpiIcon color="#64748b" bg="#f1f5f9">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-6" /></svg>
            </KpiIcon>
          </div>
          <div className="sl-bar" style={{ marginTop: 4, height: 10 }}>
            <i style={{ width: `${(safe(totals.interested) / qualityTotal) * 100}%`, background: '#059669', float: 'left' }} />
            <i style={{ width: `${(safe(totals.review) / qualityTotal) * 100}%`, background: '#d97706', float: 'left' }} />
            <i style={{ width: `${(safe(totals.low) / qualityTotal) * 100}%`, background: '#cbd5e1', float: 'left' }} />
            <i style={{ width: `${(safe(totals.unscored) / qualityTotal) * 100}%`, background: '#e2e8f0', float: 'left' }} />
          </div>
          <div className="sl-kpi-sub">
            <span>Hot {num(totals.interested)} · Review {num(totals.review)}</span>
            <span>Low {num(totals.low)} · — {num(totals.unscored)}</span>
          </div>
        </div>
      </div>

      {/* ── Trend + channel mix ────────────────────────────────────── */}
      <div className="sl-grid-2">
        <div className="sl-card">
          <div className="sl-card-head">
            <div>
              <h3 className="sl-card-title">Leads ingestion &amp; trajectory</h3>
              <div className="sl-card-sub">Daily leads by source, with hot and placed lines</div>
            </div>
            <span className="sl-pill">{data?.days || 30}-day view</span>
          </div>
          <div className="sl-chart">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip labelFormatter={fmtDate} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="meta" name="Meta" stackId="s" fill={SOURCE_COLOR.meta} />
                <Bar dataKey="google" name="Google" stackId="s" fill={SOURCE_COLOR.google} />
                <Bar dataKey="whatsapp" name="WhatsApp" stackId="s" fill={SOURCE_COLOR.whatsapp} />
                <Bar dataKey="email" name="Email" stackId="s" fill={SOURCE_COLOR.email} />
                <Bar dataKey="linkedin" name="LinkedIn" stackId="s" fill={SOURCE_COLOR.linkedin} />
                <Line type="monotone" dataKey="hot" name="Hot" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="placed" name="Placed" stroke="#4f46e5" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sl-card">
          <div className="sl-card-head">
            <div>
              <h3 className="sl-card-title">Channel mix</h3>
              <div className="sl-card-sub">Share of volume + placement yield</div>
            </div>
            <span className="sl-pill">{num(totals.leads)} leads</span>
          </div>
          <div className="sl-mix">
            {bySource.map((s) => {
              const share = totals.leads ? s.leads / totals.leads : 0
              const yieldPct = s.leads ? s.placed / s.leads : 0
              return (
                <div key={s.source}>
                  <div className="sl-mix-head">
                    <span className="sl-mix-name">
                      <span className="sl-dot" style={{ background: SOURCE_COLOR[s.key] || '#94a3b8' }} />
                      {SOURCE_LABEL[s.key] || s.source}
                    </span>
                    <span className="sl-mix-meta">{num(s.leads)} · {pct(share)}</span>
                  </div>
                  <div className="sl-bar">
                    <i style={{ width: `${(s.leads / sourceMax) * 100}%`, background: SOURCE_COLOR[s.key] || '#94a3b8' }} />
                  </div>
                  <div className="sl-mix-head" style={{ marginTop: 3, marginBottom: 0 }}>
                    <span className="sl-soft" style={{ fontSize: 10.5 }}>Placed {num(s.placed)}</span>
                    <span className="sl-soft" style={{ fontSize: 10.5 }}>Yield {pct(yieldPct)}</span>
                  </div>
                </div>
              )
            })}
            {!bySource.length && <div className="sl-empty">No leads in this period.</div>}
          </div>
        </div>
      </div>

      {/* ── Funnel + NGO matrix ────────────────────────────────────── */}
      <div className="sl-grid-eq">
        <div className="sl-card">
          <div className="sl-card-head">
            <div>
              <h3 className="sl-card-title">Conversion funnel</h3>
              <div className="sl-card-sub">{funnel ? 'Meta ad impressions through station placement' : 'Captured leads through station placement'}</div>
            </div>
            <span className="sl-pill">{pct(placedRate)} placed</span>
          </div>
          <div className="sl-funnel">
            {funnelSteps.map((step, i) => (
              <div className="sl-funnel-row" key={step.label}>
                <div className="sl-funnel-head">
                  <span><b style={{ color: 'var(--ink-soft)', marginRight: 6 }}>{i + 1}</b>{step.label}</span>
                  <b>{num(step.value)}</b>
                </div>
                <div className="sl-bar" style={{ height: 10 }}>
                  <i style={{ width: `${Math.max(1.5, (step.value / funnelMax) * 100)}%`, background: step.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sl-card">
          <div className="sl-card-head">
            <div>
              <h3 className="sl-card-title">NGO &amp; station fulfilment</h3>
              <div className="sl-card-sub">Leads and placements per partner</div>
            </div>
            <span className="sl-pill">{byNgo.length} partners</span>
          </div>
          <div className="sl-ngo">
            {byNgo.map((n) => {
              const rate = n.leads ? n.placed / n.leads : 0
              return (
                <div className="sl-ngo-row" key={n.ngo}>
                  <div className="sl-ngo-head">
                    <span className="sl-ngo-name">
                      {n.ngo}
                      {n.ngo === 'Unmapped'
                        ? <span className="sl-tag">QUEUE</span>
                        : <span className="sl-tag">{n.placed} placed</span>}
                    </span>
                    <span className="sl-ngo-meta">{num(n.leads)} leads · {pct(rate)}</span>
                  </div>
                  <div className="sl-bar">
                    <i style={{ width: `${Math.max(1.5, rate * 100)}%`, background: n.ngo === 'Unmapped' ? '#d97706' : 'var(--primary)' }} />
                  </div>
                </div>
              )
            })}
            {!byNgo.length && <div className="sl-empty">No leads in this period.</div>}
          </div>
        </div>
      </div>

      {/* ── Campaign + form tables ─────────────────────────────────── */}
      <div className="sl-grid-eq">
        <div className="sl-card">
          <div className="sl-card-head">
            <div>
              <h3 className="sl-card-title">Campaign performance</h3>
              <div className="sl-card-sub">Top campaigns by leads</div>
            </div>
            <span className="sl-pill">{byCampaign.length} campaigns</span>
          </div>
          <div className="sl-table-wrap">
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Source</th>
                  <th className="num">Leads</th>
                  <th className="num">Hot</th>
                  <th className="num">Placed</th>
                </tr>
              </thead>
              <tbody>
                {byCampaign.map((c, i) => (
                  <tr key={`${c.source}-${c.campaign_id || c.campaign_name || i}`}>
                    <td className="sl-clip sl-strong" title={c.campaign_name || c.campaign_id}>{c.campaign_name || c.campaign_id || '—'}</td>
                    <td><SourceBadge sourceKey={data?.sources?.find((s) => s.source === c.source)?.key} text={c.source} /></td>
                    <td className="num sl-strong">{num(c.leads)}</td>
                    <td className="num">{num(c.hot)}</td>
                    <td className="num">{num(c.placed)}</td>
                  </tr>
                ))}
                {!byCampaign.length && <tr><td colSpan={5}><div className="sl-empty">No campaigns yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sl-card">
          <div className="sl-card-head">
            <div>
              <h3 className="sl-card-title">Form performance</h3>
              <div className="sl-card-sub">Lead assets by NGO</div>
            </div>
            <span className="sl-pill">{byForm.length} forms</span>
          </div>
          <div className="sl-table-wrap">
            <table className="sl-table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th>NGO</th>
                  <th className="num">Leads</th>
                  <th className="num">Hot</th>
                  <th className="num">Placed</th>
                </tr>
              </thead>
              <tbody>
                {byForm.map((f, i) => (
                  <tr key={`${f.source}-${f.form_id || f.form_name || i}`}>
                    <td className="sl-clip sl-strong" title={f.form_name || f.form_id}>{f.form_name || f.form_id || '—'}</td>
                    <td className="sl-soft">{f.ngo || '—'}</td>
                    <td className="num sl-strong">{num(f.leads)}</td>
                    <td className="num">{num(f.hot)}</td>
                    <td className="num">{num(f.placed)}</td>
                  </tr>
                ))}
                {!byForm.length && <tr><td colSpan={5}><div className="sl-empty">No forms yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Live feed ──────────────────────────────────────────────── */}
      <div className="sl-card">
        <div className="sl-feed-head">
          <div>
            <h3 className="sl-card-title">Live inbound leads</h3>
            <div className="sl-card-sub">{num(recent.length)} shown · {data?.from} → {data?.to}</div>
          </div>
          <span className="sl-pill">{loading ? 'Syncing…' : 'Up to date'}</span>
        </div>
        <div className="sl-table-wrap">
          <table className="sl-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Lead</th>
                <th>Phone</th>
                <th>Source</th>
                <th>Platform</th>
                <th>Campaign</th>
                <th>NGO</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id}>
                  <td className="sl-soft" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td>
                  <td className="sl-strong" style={{ whiteSpace: 'nowrap' }}>{r.name || '—'}</td>
                  <td className="sl-soft" style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                  <td><SourceBadge sourceKey={data?.sources?.find((s) => s.source === r.source)?.key} text={r.source} /></td>
                  <td className="sl-soft">{r.platform || '—'}</td>
                  <td className="sl-clip" title={r.campaign_name}>{r.campaign_name || '—'}</td>
                  <td>{r.ngo || '—'}</td>
                  <td className="sl-soft">{r.status || '—'}</td>
                  <td>
                    {r.placed
                      ? <span className="sl-badge ok">Placed</span>
                      : <span className="sl-badge idle">—</span>}
                  </td>
                </tr>
              ))}
              {!paged.length && <tr><td colSpan={9}><div className="sl-empty">No leads match this view.</div></td></tr>}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="sl-pager">
            <button className="sl-btn" type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Prev</button>
            <span>Page {safePage} / {pageCount}</span>
            <button className="sl-btn" type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}

function SourceBadge({ sourceKey, text }) {
  const key = sourceKey || 'other'
  return <span className={`sl-badge src-${key}`}>{SOURCE_LABEL[key] || text}</span>
}
