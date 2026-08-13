import { useState, useEffect } from 'react'
import { api } from '../api/auth'

export default function Incentives() {
  const [summary, setSummary] = useState([])
  const [workers, setWorkers] = useState([])
  const [err, setErr] = useState('')

  const load = () => {
    Promise.all([
      api('/incentive/monthly-summary').catch(() => []),
      api('/workers'),
    ]).then(([s, w]) => {
      setSummary(Array.isArray(s) ? s : [])
      setWorkers(w)
    }).catch(e => setErr(e.message))
  }
  useEffect(load, [])

  const workerMap = {}
  workers.forEach(w => { workerMap[w.id] = w })

  const formatMoney = (v) => v ? `₹${Number(v).toLocaleString()}` : '₹0'

  return (
    <div className="sa-page">
      <h3>FRO Incentives — Monthly Summary</h3>
      {err && <div className="sa-err-card">{err}</div>}

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Worker</th><th>Target</th><th>Achievement</th><th>AKI Payout</th><th>Monthly</th><th>% Met</th></tr></thead>
          <tbody>
            {summary.map(s => {
              const w = workerMap[s.worker_id]
              const pct = s.target > 0 ? Math.round((s.achievement / s.target) * 100) : 0
              return (
                <tr key={s.worker_id}>
                  <td>{w?.name || `ID ${s.worker_id}`}</td>
                  <td>{formatMoney(s.target)}</td>
                  <td>{formatMoney(s.achievement)}</td>
                  <td>{formatMoney(s.akiPayout || 0)}</td>
                  <td>{formatMoney(s.monthlyIncentive || 0)}</td>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{flex:1,height:6,background:'#e5e7eb',borderRadius:3}}>
                        <div style={{width:`${Math.min(pct, 100)}%`,height:6,background:pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444',borderRadius:3}} />
                      </div>
                      <span style={{fontWeight:600,fontSize:12}}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {summary.length === 0 && <tr><td colSpan={6} className="sa-muted sa-center">No incentive data available</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
