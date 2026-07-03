import { useState, useEffect } from 'react'
import { api } from '../api/auth'

export default function WorkerDetail({ workerId, onBack }) {
  const [worker, setWorker] = useState(null)
  const [allocations, setAllocations] = useState([])
  const [salary, setSalary] = useState(null)
  const [froStats, setFroStats] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([
      api(`/workers/${workerId}`),
      api(`/workers/${workerId}/allocations`),
      api(`/salary/worker/${workerId}/allocations`).catch(() => null),
    ]).then(([w, a, s]) => {
      setWorker(w); setAllocations(a || []); setSalary(s)
    }).catch(e => setErr(e.message))
  }, [workerId])

  useEffect(() => {
    if (worker?.department?.toLowerCase() === 'fro') {
      api(`/dashboard/fro-worker/${workerId}`).then(setFroStats).catch(() => {})
    }
  }, [workerId, worker?.department])

  if (err) return <div className="sa-err-card">{err}</div>
  if (!worker) return (
    <div className="sa-page">
      <div className="sa-page-header" style={{marginBottom:16}}>
        <div className="sk" style={{width:100,height:18}} />
        <div className="sk" style={{width:60,height:32,borderRadius:6}} />
      </div>
      <div className="sa-card">
        <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:20}}>
          <div className="sk" style={{width:64,height:64,borderRadius:12}} />
          <div><div className="sk" style={{width:180,height:16,marginBottom:6}} /><div className="sk" style={{width:120,height:12}} /></div>
        </div>
        <div className="detail-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} className="detail-field"><div className="sk" style={{width:'50%',height:10,marginBottom:4}} /><div className="sk" style={{width:'80%',height:14}} /></div>)}
        </div>
      </div>
    </div>
  )

  const formatMoney = (v) => v ? `₹${Number(v).toLocaleString()}` : '₹0'

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <button className="btn" onClick={onBack}>← Back</button>
        <h3 style={{margin:'8px 0 0'}}>{worker.name}</h3>
      </div>

      <div className="sa-row">
        <div className="sa-card">
          <h3 className="sa-card-title">Personal Info</h3>
          <table className="sa-info-table">
            <tbody>
              <tr><td>Login ID</td><td><code>{worker.login_id}</code></td></tr>
              <tr><td>Department</td><td>{worker.department || '—'}</td></tr>
              <tr><td>Email</td><td>{worker.email || '—'}</td></tr>
              <tr><td>Phone</td><td>{worker.phone || '—'}</td></tr>
              <tr><td>Gender</td><td>{worker.gender || '—'}</td></tr>
              <tr><td>DOB</td><td>{worker.dob || '—'}</td></tr>
              <tr><td>Salary</td><td>{formatMoney(worker.salary)}</td></tr>
              <tr><td>Status</td><td><span className={`sa-badge ${worker.is_active !== false ? 'active' : 'inactive'}`}>
                {worker.is_active !== false ? 'Active' : 'Inactive'}
              </span></td></tr>
              <tr><td>Joined</td><td>{worker.created_at ? new Date(worker.created_at).toLocaleDateString() : '—'}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="sa-card">
          <h3 className="sa-card-title">NGO Allocations</h3>
          {allocations.length === 0 ? (
            <p className="sa-muted">No NGO allocations</p>
          ) : (
            <table className="sa-table">
              <thead><tr><th>NGO</th><th>Portion</th><th>%</th></tr></thead>
              <tbody>
                {allocations.map(a => (
                  <tr key={a.id}>
                    <td>{a.ngo_name || `NGO #${a.ngo_id}`}</td>
                    <td>{formatMoney(a.salary_portion)}</td>
                    <td>{worker.salary ? Math.round((Number(a.salary_portion) / Number(worker.salary)) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {salary && (
        <div className="sa-card">
          <h3 className="sa-card-title">Salary Breakdown</h3>
          <div className="sa-stat-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))'}}>
            <div className="sa-stat-card"><div className="sa-stat-label">Total Salary</div><div className="sa-stat-value">{formatMoney(salary.totalSalary)}</div></div>
            <div className="sa-stat-card"><div className="sa-stat-label">Per Day</div><div className="sa-stat-value">{formatMoney(salary.perDay)}</div></div>
            <div className="sa-stat-card"><div className="sa-stat-label">Days in Month</div><div className="sa-stat-value">{salary.daysInMonth || '—'}</div></div>
            {salary.sundayBonus?.incentiveAKI ? <div className="sa-stat-card"><div className="sa-stat-label">Incentive AKI</div><div className="sa-stat-value">{formatMoney(salary.sundayBonus.incentiveAKI)}</div></div> : null}
            {salary.sundayBonus?.incentiveMonthly ? <div className="sa-stat-card"><div className="sa-stat-label">Monthly Incentive</div><div className="sa-stat-value">{formatMoney(salary.sundayBonus.incentiveMonthly)}</div></div> : null}
            {salary.sundayBonus?.bonusAmount ? <div className="sa-stat-card"><div className="sa-stat-label">Sunday Bonus</div><div className="sa-stat-value">{formatMoney(salary.sundayBonus.bonusAmount)}</div></div> : null}
          </div>
        </div>
      )}

      {froStats && (
        <div className="sa-card">
          <h3 className="sa-card-title">FRO Performance</h3>
          <div className="sa-stat-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))'}}>
            <a className="sa-stat-card" style={{cursor:'pointer',textDecoration:'none',color:'inherit'}} href={`/sa/fro-donations/${workerId}`} target="_blank" rel="noopener noreferrer">
              <div className="sa-stat-label">Total Donation</div>
              <div className="sa-stat-value">₹{Number(froStats.total_donations || 0).toLocaleString()}</div>
            </a>
            <a className="sa-stat-card" style={{cursor:'pointer',textDecoration:'none',color:'inherit'}} href={`/sa/fro-donations/${workerId}?period=today`} target="_blank" rel="noopener noreferrer">
              <div className="sa-stat-label">Daily Donation</div>
              <div className="sa-stat-value">₹{Number(froStats.daily_donations || 0).toLocaleString()}</div>
            </a>
            <a className="sa-stat-card" style={{cursor:'pointer',textDecoration:'none',color:'inherit'}} href={`/sa/fro-new-donors/${workerId}`} target="_blank" rel="noopener noreferrer">
              <div className="sa-stat-label">New Donors Today</div>
              <div className="sa-stat-value">{froStats.new_donors_today || 0}</div>
            </a>
            <a className="sa-stat-card" style={{cursor:'pointer',textDecoration:'none',color:'inherit'}} href={`/sa/fro-assignments/${workerId}`} target="_blank" rel="noopener noreferrer">
              <div className="sa-stat-label">Assigned Data</div>
              <div className="sa-stat-value">{froStats.assigned_data || 0}</div>
            </a>
            <a className="sa-stat-card" style={{cursor:'pointer',textDecoration:'none',color:'inherit'}} href={`/sa/fro-assignments/${workerId}?status=contacted`} target="_blank" rel="noopener noreferrer">
              <div className="sa-stat-label">Data Used</div>
              <div className="sa-stat-value">{froStats.data_used || 0}</div>
            </a>
            <a className="sa-stat-card" style={{cursor:'pointer',textDecoration:'none',color:'inherit'}} href={`/sa/fro-assignments/${workerId}?status=pending`} target="_blank" rel="noopener noreferrer">
              <div className="sa-stat-label">Data Unused</div>
              <div className="sa-stat-value">{froStats.data_unused || 0}</div>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
