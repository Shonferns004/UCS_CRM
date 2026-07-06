import { useState, useEffect } from 'react'
import { fetchEvents, generateEventReport } from '../store'

const REPORT_TYPES = [
  { id:'summary', label:'Event Summary' },
  { id:'beneficiary', label:'Beneficiary Report' },
  { id:'material', label:'Material Distribution Report' },
  { id:'expense', label:'Expense Report' },
  { id:'asset', label:'Asset Utilization Report' },
  { id:'volunteer', label:'Volunteer Report' },
  { id:'csr', label:'CSR Report' },
  { id:'donor', label:'Donor Report' },
  { id:'impact', label:'Impact Report' },
]

export default function EventReports() {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [reportType, setReportType] = useState('summary')
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchEvents().then(setEvents).catch(() => {}) }, [])

  const generate = async () => {
    if (!selectedEvent) return
    setLoading(true)
    try {
      const data = await generateEventReport(selectedEvent, reportType)
      setReportData(data)
    } catch (err) { alert('Failed to generate report') }
    finally { setLoading(false) }
  }

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <h3 style={{fontSize:16}}>Event Reports</h3>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{padding:'6px 10px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:13}}>
            <option value="">Select Event</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <select value={reportType} onChange={e => { setReportType(e.target.value); setReportData(null) }} style={{padding:'6px 10px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:13}}>
            {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={!selectedEvent || loading}>
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
      {reportData && (
        <div className="card">
          <div className="card-head">
            <h3>{REPORT_TYPES.find(r => r.id === reportType)?.label}</h3>
            <div style={{display:'flex',gap:6}}>
              <button className="btn btn-sm" onClick={() => window.print()}>🖨 Print</button>
              <button className="btn btn-sm" onClick={() => { const b = new Blob([JSON.stringify(reportData,null,2)], {type:'application/json'}); window.open(URL.createObjectURL(b)) }}>📥 Export JSON</button>
            </div>
          </div>
          <div className="card-pad">
            <pre style={{fontSize:13,whiteSpace:'pre-wrap',color:'var(--ink)'}}>{JSON.stringify(reportData, null, 2)}</pre>
          </div>
        </div>
      )}
      {!reportData && !loading && <div className="card"><div className="card-pad" style={{textAlign:'center',padding:40,color:'var(--ink-soft)'}}>Select an event and report type, then click Generate</div></div>}
    </>
  )
}
