import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/auth'

function StationSelectModal({ stations, onClose, onDistribute }) {
  const [selected, setSelected] = useState(() => new Set(stations.map(s => s.station)))
  const [loading, setLoading] = useState(false)

  const toggle = (station) => {
    const next = new Set(selected)
    if (next.has(station)) next.delete(station)
    else next.add(station)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === stations.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(stations.map(s => s.station)))
    }
  }

  const handleDistribute = async () => {
    if (selected.size === 0) return
    setLoading(true)
    try {
      const res = await apiPost('/ngo-admin/new-data/distribute', { stations: Array.from(selected) })
      onDistribute(res)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <h3>Select Stations to Distribute</h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.size === stations.length} onChange={toggleAll} />
            <strong>Select All</strong>
            <span className="count" style={{ marginLeft: 4 }}>{stations.length}</span>
          </label>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stations.map(s => (
              <label key={s.station} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: selected.has(s.station) ? '#f0fdf4' : 'transparent' }}>
                <input type="checkbox" checked={selected.has(s.station)} onChange={() => toggle(s.station)} />
                <span style={{ fontWeight: 600, flex: 1 }}>{s.station}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                  {s.fro_worker_name ? s.fro_worker_name : 'No FRO'}
                </span>
                <span className="pill pill-blue" style={{ fontSize: 11 }}>{s.donor_count}</span>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleDistribute} disabled={loading || selected.size === 0}>
              {loading ? 'Distributing...' : `Distribute to ${selected.size} station(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NewData() {
  const [donors, setDonors] = useState([])
  const [loading, setLoading] = useState(true)
  const [distributing, setDistributing] = useState(false)
  const [result, setResult] = useState(null)
  const [showStationSelect, setShowStationSelect] = useState(false)
  const [stations, setStations] = useState([])
  const [selectedNgoId, setSelectedNgoId] = useState('all')
  const [accessibleNgos, setAccessibleNgos] = useState([])

  useEffect(() => {
    apiGet('/ngo-admin/ngos').then(setAccessibleNgos).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true)
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    Promise.all([
      apiGet(`/ngo-admin/new-data${ngoParam}`),
      apiGet('/ngo-admin/stations'),
    ]).then(([d, s]) => {
      setDonors(Array.isArray(d) ? d : d?.unassigned || [])
      setStations(Array.isArray(s) ? s : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(load, [selectedNgoId])

  const handleDistributeAll = async () => {
    const count = donors.length
    if (count === 0) return
    if (!confirm(`Distribute ${count} donor(s) equally among all stations?`)) return
    setDistributing(true)
    setResult(null)
    try {
      const res = await apiPost('/ngo-admin/new-data/distribute', {})
      setResult(res)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setDistributing(false)
    }
  }

  return (
    <div>
      <div className="filter-bar">
        <span style={{fontSize:13, fontWeight:600, color:'var(--ink-soft)'}}>NGO:</span>
        <select value={selectedNgoId} onChange={e => setSelectedNgoId(e.target.value)}>
          <option value="all">All NGOs</option>
          {accessibleNgos.map(ngo => (
            <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
          ))}
        </select>
      </div>
      {result && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, color: '#166534' }}>
          {result.message}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>New Data</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="count">{donors.length} donors</span>
            <button className="btn btn-primary btn-sm" onClick={handleDistributeAll} disabled={distributing || donors.length === 0}>
              {distributing ? 'Distributing...' : 'Distribute to All Stations'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setShowStationSelect(true)} disabled={donors.length === 0}>
              Select Stations & Distribute
            </button>
          </div>
        </div>
        <div className="card-pad">
          {loading ? (
            <div className="loading">Loading new data...</div>
          ) : donors.length === 0 ? (
            <div className="empty-state"><p>No unassigned data. Import new data via the Data Import page.</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Imported</th>
                </tr>
              </thead>
              <tbody>
                {donors.map((d, i) => (
                  <tr key={d.id || d.mobile_number || i}>
                    <td><strong>{d.name || '\u2014'}</strong></td>
                    <td><code>{d.mobile_number}</code></td>
                    <td><span className="pill">{d.category || '\u2014'}</span></td>
                    <td>{'\u20B9'}{Number(d.amount || 0).toLocaleString()}</td>
                    <td className="muted">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showStationSelect && (
        <StationSelectModal
          stations={stations}
          onClose={() => setShowStationSelect(false)}
          onDistribute={(res) => { setShowStationSelect(false); setResult(res); load() }}
        />
      )}
    </div>
  )
}
