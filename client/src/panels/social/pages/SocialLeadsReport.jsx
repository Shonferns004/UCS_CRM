import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { fetchSocialLeadsOverview } from '../../../api/socialLeads'

// Social Media panel → Leads Report.
//
// One read-only overview of the leads the digital team brings in (Meta lead ads,
// Google lead forms, WhatsApp bulk replies, bulk email, LinkedIn). The KPI cards,
// trend and tables all read the same backend aggregation, so nothing on screen
// can disagree with another number. Spend / CPL appear only when a Meta ad
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

const SOURCE_COLOR = {
  meta: '#0866ff',
  google: '#ea4335',
  whatsapp: '#25d366',
  email: '#6366f1',
  linkedin: '#0a66c2',
}
const SOURCE_LABEL = {
  meta: 'Meta',
  google: 'Google',
  whatsapp: 'WhatsApp',
  email: 'Email replies',
  linkedin: 'LinkedIn',
}

const card = {
  background: 'var(--card-bg)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 16,
}
const label = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--ink-soft)',
}
const selectStyle = {
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid var(--line)',
  background: 'var(--card-bg)',
  color: 'var(--ink)',
  fontSize: 12,
  fontFamily: 'inherit',
}

export default function SocialLeadsReport() {
  const [days, setDays] = useState('30')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [source, setSource] = useState('')
  const [ngo, setNgo] = useState('')
  const [platform, setPlatform] = useState('')
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
    const params = { source, platform, q: debounced }
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
  }, [days, from, to, source, ngo, platform, debounced])

  useEffect(() => load(), [load])
  useEffect(() => { setPage(1) }, [days, from, to, source, ngo, platform, debounced])

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
  const qualityTotal = Math.max(1, (totals.interested || 0) + (totals.review || 0) + (totals.low || 0) + (totals.unscored || 0))
  const placedRate = totals.leads ? (totals.placed || 0) / totals.leads : 0

  const pageCount = Math.max(1, Math.ceil(recent.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(
    () => recent.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [recent, safePage],
  )

  const funnelSteps = funnel
    ? [
      { label: 'Impressions', value: funnel.impressions || 0, color: '#93c5fd' },
      { label: 'Clicks', value: funnel.clicks || 0, color: '#60a5fa' },
      { label: 'Meta leads', value: funnel.meta_leads || 0, color: '#3b82f6' },
      { label: 'CRM leads', value: funnel.crm_leads || totals.leads || 0, color: '#2563eb' },
      { label: 'Placed', value: funnel.placed_leads || totals.placed || 0, color: '#4f46e5' },
    ]
    : [
      { label: 'Captured leads', value: totals.leads || 0, color: '#3b82f6' },
      { label: 'Interested (hot)', value: totals.hot || 0, color: '#059669' },
      { label: 'Placed in station', value: totals.placed || 0, color: '#4f46e5' },
    ]
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value))

  const exportCsv = () => {
    const header = ['Date', 'Name', 'Phone', 'Email', 'Source', 'Platform', 'Campaign', 'Form', 'NGO', 'Status', 'Placed']
    const rows = recent.map((r) => [
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
      r.name, r.phone, r.email, r.source, r.platform, r.campaign_name, r.form_name, r.ngo, r.status, r.placed ? 'yes' : 'no',
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
    return <div style={{ padding: 24, color: 'var(--ink-soft)', fontSize: 13 }}>Loading leads overview…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div>
          <div style={label}>Period</div>
          <select
            value={from && to ? 'custom' : days}
            onChange={(e) => { setDays(e.target.value); setFrom(''); setTo('') }}
            style={selectStyle}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            {from && to && <option value="custom">Custom range</option>}
          </select>
        </div>
        <div>
          <div style={label}>From</div>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            style={selectStyle}
          />
        </div>
        <div>
          <div style={label}>To</div>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            style={selectStyle}
          />
        </div>
        {from && to && (
          <div style={{ alignSelf: 'flex-end' }}>
            <button onClick={() => { setFrom(''); setTo('') }} style={{ ...selectStyle, cursor: 'pointer', fontWeight: 700 }}>
              Clear range
            </button>
          </div>
        )}
        <div>
          <div style={label}>Source</div>
          <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle}>
            <option value="">All sources</option>
            {(data?.sources || []).map((s) => <option key={s.source} value={s.source}>{SOURCE_LABEL[s.key] || s.source}</option>)}
          </select>
        </div>
        <div>
          <div style={label}>NGO</div>
          <select value={ngo} onChange={(e) => setNgo(e.target.value)} style={selectStyle}>
            <option value="">All NGOs</option>
            {(data?.ngo_options || [
              { ngo: 'BSCT' }, { ngo: 'AFLF' }, { ngo: 'MANN' }, { ngo: 'Unmapped' },
            ]).map((o) => (
              <option key={o.ngo} value={o.ngo}>
                {o.ngo}{typeof o.count === 'number' ? ` (${o.count})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={label}>Platform</div>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            <option value="fb">Facebook</option>
            <option value="ig">Instagram</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={label}>Search</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, email or campaign"
            style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button onClick={load} disabled={loading} style={{ ...selectStyle, cursor: 'pointer', fontWeight: 700 }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button onClick={exportCsv} disabled={!recent.length} style={{ ...selectStyle, cursor: 'pointer', fontWeight: 700 }}>
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>{error}</div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <div style={card}>
          <div style={label}>Total leads</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: -1 }}>{num(totals.leads)}</span>
            {totals.change_pct != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: totals.change_pct >= 0 ? '#047857' : '#b91c1c', background: totals.change_pct >= 0 ? '#ecfdf5' : '#fef2f2', border: `1px solid ${totals.change_pct >= 0 ? '#a7f3d0' : '#fecaca'}`, padding: '2px 8px', borderRadius: 999 }}>
                {totals.change_pct >= 0 ? '▲' : '▼'} {Math.abs(totals.change_pct)}%
              </span>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)' }}>
            {data?.custom
              ? `${num(totals.range_end)} on ${fmtDate(data?.to)} · vs ${num(totals.previous)} prev period`
              : `${num(totals.today)} today · vs ${num(totals.previous)} prev period`}
          </div>
        </div>

        <div style={card}>
          <div style={label}>Hot / interested</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#047857', letterSpacing: -1, marginTop: 8 }}>{num(totals.hot)}</div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)' }}>avg intent score {totals.avg_score || 0} · {num(totals.scored)} scored</div>
        </div>

        <div style={card}>
          <div style={label}>Placed in station</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#4f46e5', letterSpacing: -1, marginTop: 8 }}>{num(totals.placed)}</div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)' }}>{pct(placedRate)} placement rate</div>
        </div>

        <div style={card}>
          <div style={label}>Platform split</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#0866ff' }}>{num(totals.facebook)} <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>FB</span></span>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#db2777' }}>{num(totals.instagram)} <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>IG</span></span>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)' }}>{num(totals.google)} Google leads · {num(totals.mapped)} mapped to an NGO</div>
        </div>

        <div style={card}>
          <div style={label}>Spend / CPL (Meta)</div>
          {insights ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: -1, marginTop: 8 }}>{money(insights.cpl)}</div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)' }}>Spend {money(insights.spend)} · {num(insights.clicks)} clicks</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink-soft)', marginTop: 8 }}>—</div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)' }}>
                {data?.custom
                  ? 'Spend & CPL are shown for the rolling 7/30/90-day views'
                  : 'Connect a Meta ad account to load spend & CPL'}
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <div style={label}>Lead quality</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: '#f1f5f9', marginTop: 12 }}>
            <div style={{ width: `${((totals.interested || 0) / qualityTotal) * 100}%`, background: '#059669' }} />
            <div style={{ width: `${((totals.review || 0) / qualityTotal) * 100}%`, background: '#f59e0b' }} />
            <div style={{ width: `${((totals.low || 0) / qualityTotal) * 100}%`, background: '#cbd5e1' }} />
            <div style={{ width: `${((totals.unscored || 0) / qualityTotal) * 100}%`, background: '#e2e8f0' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 8 }}>
            <span>Hot {num(totals.interested)}</span>
            <span>Review {num(totals.review)}</span>
            <span>Low {num(totals.low)}</span>
          </div>
        </div>
      </div>

      {/* Trend + source mix */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 14 }}>
        <div style={card}>
          <div style={{ ...label, marginBottom: 12 }}>Leads per day by source</div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
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
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <div style={{ ...label, marginBottom: 12 }}>Source mix</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bySource.map((s) => (
              <div key={s.source}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700 }}>{SOURCE_LABEL[s.key] || s.source}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>{num(s.leads)} · {pct(totals.leads ? s.leads / totals.leads : 0)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ width: `${(s.leads / sourceMax) * 100}%`, height: '100%', background: SOURCE_COLOR[s.key] || '#94a3b8' }} />
                </div>
              </div>
            ))}
            {!bySource.length && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No leads in this period.</div>}
          </div>
        </div>
      </div>

      {/* Funnel + NGO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
        <div style={card}>
          <div style={{ ...label, marginBottom: 12 }}>Conversion funnel</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {funnelSteps.map((step) => (
              <div key={step.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                  <span>{step.label}</span>
                  <span style={{ fontWeight: 700 }}>{num(step.value)}</span>
                </div>
                <div style={{ height: 12, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(1.5, (step.value / funnelMax) * 100)}%`, height: '100%', background: step.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{ ...label, marginBottom: 12 }}>Leads by NGO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byNgo.map((n) => (
              <div key={n.ngo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 600 }}>{n.ngo}</span>
                <span style={{ color: 'var(--ink-soft)' }}>{num(n.leads)} leads · {num(n.placed)} placed</span>
              </div>
            ))}
            {!byNgo.length && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No leads in this period.</div>}
          </div>
        </div>
      </div>

      {/* Campaign + form tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
        <TableCard title="Campaign performance" columns={['Campaign', 'Source', 'Leads', 'Hot', 'Placed']}
          rows={byCampaign.map((c) => [
            c.campaign_name || c.campaign_id || '—',
            SOURCE_LABEL[c.key] || c.source,
            num(c.leads), num(c.hot), num(c.placed),
          ])} />
        <TableCard title="Form performance" columns={['Form', 'NGO', 'Leads', 'Hot', 'Placed']}
          rows={byForm.map((f) => [
            f.form_name || f.form_id || '—',
            f.ngo || '—',
            num(f.leads), num(f.hot), num(f.placed),
          ])} />
      </div>

      {/* Recent leads */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={label}>Recent leads</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{num(recent.length)} shown · {data?.from} → {data?.to}</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                {['Date', 'Name', 'Phone', 'Source', 'Platform', 'Campaign', 'NGO', 'Status', 'Placed'].map((h) => (
                  <th key={h} style={{ padding: '7px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.name || '—'}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--ink-soft)' }}>{r.phone || '—'}</td>
                  <td style={{ padding: '7px 8px' }}>{SOURCE_LABEL[data?.sources?.find((s) => s.source === r.source)?.key] || r.source}</td>
                  <td style={{ padding: '7px 8px' }}>{r.platform || '—'}</td>
                  <td style={{ padding: '7px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.campaign_name}>{r.campaign_name || '—'}</td>
                  <td style={{ padding: '7px 8px' }}>{r.ngo || '—'}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--ink-soft)' }}>{r.status || '—'}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: r.placed ? '#047857' : '#94a3b8' }}>{r.placed ? 'Placed' : '—'}</span>
                  </td>
                </tr>
              ))}
              {!paged.length && (
                <tr><td colSpan={9} style={{ padding: 18, textAlign: 'center', color: 'var(--ink-soft)' }}>No leads match this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} style={{ ...selectStyle, cursor: 'pointer' }}>Prev</button>
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Page {safePage} / {pageCount}</span>
            <button disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} style={{ ...selectStyle, cursor: 'pointer' }}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TableCard({ title, columns, rows }) {
  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: 10 }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ borderTop: '1px solid var(--line)' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '7px 8px', textAlign: ci > 1 ? 'right' : 'left', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(cell)}>{cell}</td>
                ))}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={columns.length} style={{ padding: 14, textAlign: 'center', color: 'var(--ink-soft)' }}>Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
