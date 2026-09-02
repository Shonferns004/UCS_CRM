import { useState, useEffect } from 'react'
import { fetchEvents, generateEventReport, generateAllEventsReport } from '../store'

const REPORT_TYPES = [
  { id: 'summary', label: 'Event Summary' },
  { id: 'beneficiary', label: 'Beneficiary Report' },
  { id: 'material', label: 'Material Distribution Report' },
  { id: 'expense', label: 'Expense Report' },
  { id: 'asset', label: 'Asset Utilization Report' },
  { id: 'volunteer', label: 'Volunteer Report' },
  { id: 'csr', label: 'CSR Report' },
  { id: 'donor', label: 'Donor Report' },
  { id: 'impact', label: 'Impact Report' },
]

const SUBMITTED = ['Submitted', 'Submitted&', 'Pending Approval', 'Approval Pending']
const COMPLETED = ['Completed']
const ALL_STATUS = ['Submitted', 'Completed', 'Draft', 'Approved', 'Rejected', 'Pending Approval']

const STATUS_LABEL = { Completed: '✓ COMPLETED', Submitted: 'SUBMITTED', Approved: 'APPROVED', Rejected: 'REJECTED', Draft: 'DRAFT' }
const STATUS_COLOR = { Completed: '#16a34a', Submitted: '#2563eb', Approved: '#0ea5e9', Rejected: '#dc2626', Draft: '#f59e0b' }

const money = (v) => (v == null || v === '' ? '—' : '₹' + Number(v).toLocaleString('en-IN'))
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  if (isNaN(dt)) return String(d).slice(0, 10)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtTime = (t) => {
  if (!t) return '—'
  const s = String(t)
  try {
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const [h, m] = s.split(':').map(Number)
      const am = h < 12
      return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${am ? 'AM' : 'PM'}`
    }
    return s
  } catch { return s }
}
const isImage = (u) => /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(String(u || ''))
const safe = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function Section({ title, children, right }) {
  return (
    <div style={{ margin: '20px 0', borderTop: '2px solid #e5e7eb', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

function KeyVal({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1a1a2e', fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}

function Table({ cols, rows }) {
  if (!rows || !rows.length) return <div style={{ color: '#9ca3af', fontSize: 13 }}>No records</div>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          {cols.map(c => <th key={c.key} style={{ textAlign: 'left', padding: '7px 8px', borderBottom: '1px solid #d1d5db', background: '#f3f4f6', fontWeight: 700, color: '#374151', fontSize: 11, textTransform: 'uppercase' }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map(c => <td key={c.key} style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: '#1a1a2e' }}>{c.render ? c.render(r) : r[c.key] != null ? String(r[c.key]) : '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function EventReports() {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [reportType, setReportType] = useState('summary')
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [allData, setAllData] = useState(null)
  const [allLoading, setAllLoading] = useState(false)

  const [refreshing, setRefreshing] = useState(false)

  const loadEvents = () => {
    setRefreshing(true)
    fetchEvents().then(data => {
      const list = Array.isArray(data) ? data : []
      const allowed = new Set(ALL_STATUS)
      const now = new Date()
      const normalized = list.map(e => {
        const status = allowed.has(e.status) ? e.status : e.status || 'Draft'
        let created = e.created_at || e.createdAt || null
        let isNew = false
        if (created) {
          const d = new Date(String(created).replace(' ', 'T'))
          if (!isNaN(d)) isNew = status === 'Submitted' && (now - d) / (1000 * 60 * 60 * 24) <= 7
        }
        return { ...e, status, status_new: isNew }
      })
      setEvents(normalized)
      setSelectedEvent(prev => prev || (normalized.find(e => e.status === 'Submitted')?.id) || '')
    }).catch(e => console.error('EventReports fetchEvents:', e))
      .finally(() => setRefreshing(false))
  }

  useEffect(() => {
    loadEvents() /* eslint-disable-line react-hooks/exhaustive-deps */
    const onFocus = () => loadEvents() /* eslint-disable-line react-hooks/exhaustive-deps */
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const filteredEvents = events.filter(e => !statusFilter || String(e.status) === statusFilter)

  const generate = async () => {
    if (!selectedEvent) return
    setLoading(true)
    setReportData(null)
    try {
      const data = await generateEventReport(selectedEvent, reportType)
      setReportData(data)
    } catch (err) { alert('Failed to generate report') }
    finally { setLoading(false) }
  }

  const generateAll = async () => {
    setAllLoading(true)
    setAllData(null)
    try {
      const data = await generateAllEventsReport({ status: statusFilter || undefined })
      setAllData(data)
    } catch (err) { alert('Failed to load all events summary') }
    finally { setAllLoading(false) }
  }

  const ev = reportData?.event || {}
  const isCompleted = COMPLETED.includes(ev.status)

  const downloadPdf = () => {
    window.print()
  }

  const downloadBlob = (filename, content, mime) => {
    const b = new Blob([content], { type: mime })
    const url = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const exportJSON = () => downloadBlob(`report-${reportType}-${selectedEvent}.json`, JSON.stringify(reportData, null, 2), 'application/json')

  const exportCSV = (cols, rows, filename) => {
    const head = cols.map(c => c.label).join(',')
    const body = rows.map(r => cols.map(c => {
      let v = c.render ? c.render(r) : (r[c.key] != null ? String(r[c.key]) : '')
      v = String(v ?? '').replace(/,/g, ' ')
      return '"' + v + '"'
    }).join(',')).join('\n')
    downloadBlob(filename, head + '\n' + body, 'text/csv')
  }
  const exportAllCSV = (rows) => {
    const cols = [
      { key: 'name', label: 'Event' },
      { key: 'ngo_name', label: 'NGO' },
      { key: 'sector_name', label: 'Sector' },
      { key: 'activity_name', label: 'Activity' },
      { key: 'date', label: 'Date' },
      { key: 'day', label: 'Day' },
      { key: 'start_time', label: 'Start' },
      { key: 'end_time', label: 'End' },
      { key: 'venue', label: 'Venue' },
      { key: 'status', label: 'Status' },
      { key: 'budget', label: 'Budget' },
    ]
    exportCSV(cols, rows, `all-events-summary-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const expenseCols = [
    { key: 'description', label: 'Description' },
    { key: 'category', label: 'Category' },
    { key: 'amount', label: 'Amount', render: r => money(r.amount) },
    { key: 'status', label: 'Status' },
  ]
  const attendanceCols = [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
  ]
  const distCols = [
    { key: 'beneficiary_name', label: 'Beneficiary' },
    { key: 'material', label: 'Material' },
    { key: 'quantity', label: 'Qty' },
  ]
  const checklistCols = [
    { key: 'label', label: 'Item' },
    { key: 'status', label: 'Status', render: r => (r.status ? '✓ Done' : 'Pending') },
    { key: 'notes', label: 'Notes' },
  ]
  const allCols = [
    { key: 'name', label: 'Event', render: r => r.banner ? <a href={r.banner} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{r.name || '—'}</a> : (r.name || '—') },
    { key: 'ngo_name', label: 'NGO' },
    { key: 'sector_name', label: 'Sector' },
    { key: 'activity_name', label: 'Activity' },
    { key: 'date', label: 'Date', render: r => fmtDate(r.date) },
    { key: 'day', label: 'Day' },
    { key: 'start_time', label: 'Start', render: r => fmtTime(r.start_time) },
    { key: 'end_time', label: 'End', render: r => fmtTime(r.end_time) },
    { key: 'venue', label: 'Venue' },
    { key: 'status', label: 'Status', render: r => <span style={{ color: STATUS_COLOR[r.status] || '#6b7280', fontWeight: 700 }}>{r.status}</span> },
    { key: 'budget', label: 'Budget', render: r => money(r.budget) },
  ]
  const mediaCols = [
    { key: 'title', label: 'Title', render: r => r.title || r.name || '—' },
    { key: 'media_type', label: 'Type', render: r => r.media_type || r.type || (isImage(r.url) ? 'Image' : '—') },
    { key: 'url', label: 'URL', render: r => r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>View</a> : '—' },
  ]

  const statusBadge = (s) => {
    const color = STATUS_COLOR[s] || '#6b7280'
    const label = STATUS_LABEL[s] || s
    return <span style={{ background: color, color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{label}</span>
  }

  const printHeader = (title, subtitle) => (
    <div className="eh-print-brand">
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5, color: '#2036bd' }}>UCS CRM</div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>Universal Citizen Services · Event Reports</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
    </div>
  )

  const printFooter = () => (
    <div className="eh-print-footer">
      Generated: {new Date().toLocaleString('en-IN')} · UCS CRM — Event Report · Confidential
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 16 }}>Event Reports <span style={{ fontWeight: 500, fontSize: 12, color: '#6b7280' }}>({filteredEvents.length} shown · {events.filter(e => e.status === 'Submitted').length} submitted)</span></h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setAllData(null) }} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
            <option value="">All Events</option>
            <option value="Submitted">Submitted only</option>
            <option value="Completed">Completed only</option>
            <option value="Draft">Draft only</option>
          </select>
          <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, maxWidth: 320 }}>
            <option value="">Select Event</option>
            {[...filteredEvents].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || 0).map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name} · {ev.status}{ev.status_new ? ' · NEW' : ''}
              </option>
            ))}
          </select>
          <select value={reportType} onChange={e => { setReportType(e.target.value); setReportData(null) }} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
            {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button className="btn btn-sm" onClick={loadEvents} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : '🔄 Refresh'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={!selectedEvent || loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          <button className="btn btn-sm" onClick={generateAll} disabled={allLoading}>
            {allLoading ? 'Loading...' : 'All Events Summary'}
          </button>
        </div>
      </div>

      {/* ═══ ALL-EVENTS SUMMARY ═══ */}
      {allData && (
        <div className="card" style={{ background: '#fff', marginBottom: 20 }} id="eh-all-summary">
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3>All Events Summary Report <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>({allData.total || 0} events{statusFilter ? ` · ${statusFilter}` : ''})</span></h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={downloadPdf}>Download PDF</button>
              <button className="btn btn-sm" onClick={() => exportAllCSV(allData.events || [])}>Download CSV</button>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 4 }}>
            <div className="eh-print-root">
              {printHeader('All Events Summary')}
              <div style={{ contentVisibility: 'auto' }}>
                <Table cols={allCols} rows={allData.events || []} />
              </div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <KeyVal label="Total Events" value={allData.total || 0} />
                <KeyVal label="Submitted" value={(allData.events || []).filter(e => e.status === 'Submitted').length} />
                <KeyVal label="Completed" value={(allData.events || []).filter(e => e.status === 'Completed').length} />
                <KeyVal label="Total Budget" value={money((allData.events || []).reduce((s, e) => s + (Number(e.budget) || 0), 0))} />
              </div>
              {printFooter()}
            </div>
          </div>
        </div>
      )}
      {!allData && allLoading && <div className="card"><div className="card-pad" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-soft)' }}>Loading all events summary…</div></div>}

      {/* ═══ SINGLE EVENT REPORT ═══ */}
      {reportData && (
        <div className="card" style={{ background: '#fff' }}>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3>{REPORT_TYPES.find(r => r.id === reportType)?.label}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={downloadPdf}>Download PDF</button>
              <button className="btn btn-sm" onClick={exportJSON}>Export JSON</button>
              {reportType === 'expense' && <button className="btn btn-sm" onClick={() => exportCSV(expenseCols, reportData.expenses || [], `expenses-${ev.id}.csv`)}>Export CSV</button>}
            </div>
          </div>

          <div className="card-pad" style={{ paddingTop: 4 }}>
            <div className="eh-print-root">
              {printHeader(ev.name || 'Event Report', ev.ngo_name || '')}

              {/* REPORT HEADER */}
              <div className="eh-report-body" style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ position: 'relative', background: '#0f172a' }}>
                  {ev.banner && <img src={ev.banner} alt="banner" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none' }} />}
                  {!ev.banner && <div style={{ width: '100%', height: 130, background: 'linear-gradient(135deg,#2036bd,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>EVENT BANNER</div>}
                </div>
                <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginBottom: 6 }}>{ev.name || 'Event Report'}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {ev.ngo_name && <span style={{ background: '#2036bd', color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{ev.ngo_name}</span>}
                      {statusBadge(isCompleted ? 'Completed' : ev.status)}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>{ev.day || fmtDate(ev.date)}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, minWidth: 200 }}>
                    <KeyVal label="Date" value={fmtDate(ev.date)} />
                    <KeyVal label="Day" value={ev.day ? ev.day.split(' ')[0] : '—'} />
                    <KeyVal label="Sector" value={ev.sector_name} />
                    <KeyVal label="Activity" value={ev.activity_name} />
                    <KeyVal label="Venue" value={ev.venue} />
                    <KeyVal label="Budget" value={money(ev.budget)} />
                  </div>
                </div>
              </div>

              <Section title="Event Summary">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                  <KeyVal label="Start Time" value={fmtTime(ev.start_time)} />
                  <KeyVal label="End Time" value={fmtTime(ev.end_time)} />
                  <KeyVal label="Status" value={ev.status} />
                  <KeyVal label="Expected Beneficiaries" value={ev.expected_beneficiaries || '—'} />
                </div>
              </Section>

              <Section title="Attendance" right={<span style={{ fontSize: 12, color: '#6b7280' }}>{reportData.attendance?.length || 0} records</span>}>
                <Table cols={attendanceCols} rows={reportData.attendance || []} />
              </Section>

              <Section title="Media / Images" right={<span style={{ fontSize: 12, color: '#6b7280' }}>{reportData.media?.length || 0} items</span>}>
                {(reportData.media || []).length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 10, marginBottom: 12 }}>
                      {(reportData.media || []).filter(m => isImage(m.url)).map((m, i) => (
                        <a key={i} href={m.url} target="_blank" rel="noreferrer" title={m.title || m.name} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', display: 'block' }}>
                          <img src={m.url} alt={m.title || m.name || 'media'} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                        </a>
                      ))}
                    </div>
                    <Table cols={mediaCols} rows={reportData.media || []} />
                  </>
                ) : <div style={{ color: '#9ca3af', fontSize: 13 }}>No media records</div>}
              </Section>

              <Section title="Expenses" right={<span style={{ fontSize: 12, color: '#6b7280' }}>Total: {money((reportData.expenses || []).reduce((s, x) => s + (Number(x.amount) || 0), 0))}</span>}>
                <Table cols={expenseCols} rows={reportData.expenses || []} />
              </Section>

              <Section title="Material Distribution" right={<span style={{ fontSize: 12, color: '#6b7280' }}>{reportData.distributions?.length || 0} records</span>}>
                <Table cols={distCols} rows={reportData.distributions || []} />
              </Section>

              <Section title="Checklist">
                <Table cols={checklistCols} rows={reportData.checklist || []} />
              </Section>

              {printFooter()}
            </div>
          </div>
        </div>
      )}

      {!reportData && !allData && !loading && !allLoading && <div className="card"><div className="card-pad" style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)' }}>Select an event and click Generate Report, or click All Events Summary.</div></div>}

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .eh-print-root, .eh-print-root * { visibility: visible !important; }
          .eh-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .card-head { display: none !important; }
          .eh-print-brand { border-bottom: 3px solid #2036bd; padding-bottom: 10px; margin-bottom: 16px; }
          .eh-print-footer { margin-top: 20px; border-top: 1px solid #d1d5db; padding-top: 8px; text-align: right; color: #6b7280; font-size: 10px; }
        }
        @media screen {
          .eh-print-brand { border-bottom: 3px solid #2036bd; padding-bottom: 10px; margin-bottom: 16px; }
          .eh-print-footer { margin-top: 20px; border-top: 1px solid #d1d5db; padding-top: 8px; text-align: right; color: #6b7280; font-size: 10px; }
        }
      `}</style>
    </>
  )
}