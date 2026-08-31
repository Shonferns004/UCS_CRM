import { useState, useEffect } from 'react'
import { fetchEvents, generateEventReport } from '../store'

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

const COMPLETED = ['Completed']
const money = (v) => (v == null || v === '' ? '—' : '₹' + Number(v).toLocaleString('en-IN'))
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

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

  useEffect(() => {
    let cancelled = false
    fetchEvents().then(data => { if (!cancelled) setEvents(data) }).catch(e => console.error('EventReports fetchEvents:', e))
    return () => { cancelled = true }
  }, [])

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

  const ev = reportData?.event || {}
  const isCompleted = COMPLETED.includes(ev.status)

  const exportJSON = () => {
    const b = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = url; a.download = `report-${reportType}-${selectedEvent}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const exportCSV = (cols, rows, filename) => {
    const head = cols.map(c => c.label).join(',')
    const body = rows.map(r => cols.map(c => {
      let v = c.render ? c.render(r) : (r[c.key] != null ? String(r[c.key]) : '')
      v = String(v ?? '').replace(/,/g, ' ')
      return '"' + v + '"'
    }).join(',')).join('\n')
    const b = new Blob([head + '\n' + body], { type: 'text/csv' })
    const url = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
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
  const mediaCols = [
    { key: 'title', label: 'Title', render: r => r.title || r.name || '—' },
    { key: 'media_type', label: 'Type', render: r => r.media_type || r.type || '—' },
    { key: 'url', label: 'URL', render: r => r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>View</a> : '—' },
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 16 }}>Event Reports</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
            <option value="">Select Event</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <select value={reportType} onChange={e => { setReportType(e.target.value); setReportData(null) }} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
            {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={!selectedEvent || loading}>
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {reportData && (
        <div className="card" style={{ background: '#fff' }}>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3>{REPORT_TYPES.find(r => r.id === reportType)?.label}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => window.print()}>Print / PDF</button>
              <button className="btn btn-sm" onClick={exportJSON}>Export JSON</button>
              {reportType === 'expense' && <button className="btn btn-sm" onClick={() => exportCSV(expenseCols, reportData.expenses || [], `expenses-${ev.id}.csv`)}>Export CSV</button>}
            </div>
          </div>

          <div className="card-pad" style={{ paddingTop: 4 }}>
            {/* REPORT HEADER */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 6 }}>
              {ev.banner && <img src={ev.banner} alt="banner" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none' }} />}
              <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginBottom: 6 }}>{ev.name || 'Event Report'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {ev.ngo_name && <span style={{ background: '#2036bd', color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{ev.ngo_name}</span>}
                    <span style={{ background: isCompleted ? '#16a34a' : '#f59e0b', color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                      {isCompleted ? '✓ COMPLETED' : ev.status || '—'}
                    </span>
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
                <KeyVal label="Start Time" value={ev.start_time} />
                <KeyVal label="End Time" value={ev.end_time} />
                <KeyVal label="Status" value={ev.status} />
                <KeyVal label="Expected Beneficiaries" value={ev.expected_beneficiaries || '—'} />
              </div>
            </Section>

            <Section title="Attendance" right={<span style={{ fontSize: 12, color: '#6b7280' }}>{reportData.attendance?.length || 0} records</span>}>
              <Table cols={attendanceCols} rows={reportData.attendance || []} />
            </Section>

            <Section title="Media" right={<span style={{ fontSize: 12, color: '#6b7280' }}>{reportData.media?.length || 0} items</span>}>
              <Table cols={mediaCols} rows={reportData.media || []} />
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

            <div style={{ marginTop: 22, borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 11 }}>
              <span>Generated: {new Date(reportData.generated_at).toLocaleString('en-IN')}</span>
              <span>UCS CRM · Event Report</span>
            </div>
          </div>
        </div>
      )}

      {!reportData && !loading && <div className="card"><div className="card-pad" style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)' }}>Select an event and report type, then click Generate</div></div>}

      <style>{`@media print { body * { visibility: hidden; } .card, .card * { visibility: visible; } .card { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; margin: 0; } .card-head { display: none !important; } }`}</style>
    </>
  )
}
