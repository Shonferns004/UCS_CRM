import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/auth'
import { toast } from '../../../components/Toast'

const PAGE_SIZES = [100, 500, 1000]

function StationSelectModal({ stations, onClose, onDistribute, ngoId, ngoName, category }) {
  const freshStations = stations.filter(s => s.station?.startsWith('FD-'))
  const oldStations = stations.filter(s => !s.station?.startsWith('FD-'))
  const [viewTab, setViewTab] = useState(freshStations.length > 0 ? 'fresh' : 'old')
  const [selected, setSelected] = useState(() => {
    if (freshStations.length > 0) return new Set(freshStations.map(s => s.station))
    return new Set(oldStations.map(s => s.station))
  })
  const [loading, setLoading] = useState(false)

  const getDonorCount = (dc) => {
    if (!dc) return 0
    if (typeof dc === 'number') return dc
    if (typeof dc === 'object') {
      if (ngoId && dc[ngoId] !== undefined) return Number(dc[ngoId]) || 0
      return Object.values(dc).reduce((sum, n) => sum + (Number(n) || 0), 0)
    }
    return 0
  }

  const activeList = viewTab === 'fresh' ? freshStations : oldStations
  const activeSelected = activeList.filter(s => selected.has(s.station))

  const toggle = (station) => {
    const next = new Set(selected)
    if (next.has(station)) next.delete(station)
    else next.add(station)
    setSelected(next)
  }

  const toggleAllActive = () => {
    const next = new Set(selected)
    const allActiveSelected = activeList.every(s => next.has(s.station))
    for (const s of activeList) {
      if (allActiveSelected) next.delete(s.station)
      else next.add(s.station)
    }
    setSelected(next)
  }

  const selectAll = () => {
    const next = new Set(selected)
    for (const s of activeList) next.add(s.station)
    setSelected(next)
  }

  const selectNone = () => {
    const next = new Set(selected)
    for (const s of activeList) next.delete(s.station)
    setSelected(next)
  }

  const switchTab = (t) => {
    setViewTab(t)
  }

  const handleDistribute = async () => {
    if (selected.size === 0) return
    setLoading(true)
    try {
      const body = { stations: Array.from(selected) }
      if (ngoId) body.ngo_id = ngoId
      if (category) body.category = category
      const res = await apiPost('/ngo-admin/new-data/distribute', body)
      onDistribute(res)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const tabStyle = (active) => ({
    padding: '5px 12px', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600,
    fontFamily: 'inherit', cursor: 'pointer',
    background: active ? 'var(--sage)' : 'transparent',
    color: active ? '#fff' : 'var(--ink-soft)',
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div>
            <h3 style={{ margin: 0 }}>Distribute New Data — {ngoName || 'All NGOs'}</h3>
            {category ? (
              <div style={{ fontSize: 11, color: 'var(--sage)', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Category:</span>
                <span className="pill" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontSize: 10, padding: '1px 6px' }}>{category}</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>All Categories</div>
            )}
          </div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* OLD / FRESH sub-tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 2, marginBottom: 10 }}>
            <button onClick={() => switchTab('old')} style={tabStyle(viewTab === 'old')}>
              OLD Stations ({oldStations.length})
            </button>
            <button onClick={() => switchTab('fresh')} style={tabStyle(viewTab === 'fresh')}>
              FRESH Stations ({freshStations.length})
            </button>
          </div>

          {/* Info text */}
          {viewTab === 'fresh' ? (
            <div style={{ fontSize: 11, color: '#4338ca', background: '#eef2ff', padding: '8px 10px', borderRadius: 6, marginBottom: 10, border: '1px solid #c7d2fe' }}>
              Fresh data will be distributed round-robin across selected FD stations only. Donors not present in any station will appear in FRO inboxes.
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '8px 10px', borderRadius: 6, marginBottom: 10, border: '1px solid #fcd34d' }}>
              Old stations already have existing donors. Distributing new data here will add to their queue.
            </div>
          )}

          {/* Select All + All/None buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={activeList.length > 0 && activeList.every(s => selected.has(s.station))} onChange={toggleAllActive} />
              <strong>Select All</strong>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>({activeSelected.length}/{activeList.length})</span>
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button onClick={selectAll} style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--line)', borderRadius: 4, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>All</button>
              <button onClick={selectNone} style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--line)', borderRadius: 4, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>None</button>
            </div>
          </div>

          {/* Station list */}
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--line)', borderRadius: 6, padding: 4 }}>
            {activeList.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', padding: 16 }}>
                No {viewTab === 'fresh' ? 'FD' : ''} stations found for this NGO. {viewTab === 'fresh' ? 'Import fresh data from Super Admin first to create FD stations.' : ''}
              </div>
            )}
            {activeList.map(s => (
              <label key={s.station} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', padding: '5px 8px', borderRadius: 4, background: selected.has(s.station) ? (viewTab === 'fresh' ? '#eef2ff' : '#f0fdf4') : 'transparent', transition: 'background .1s' }}>
                <input type="checkbox" checked={selected.has(s.station)} onChange={() => toggle(s.station)} />
                <span style={{ fontWeight: 600, flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{s.station}</span>
                <span style={{ fontSize: 10, color: 'var(--ink-soft)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.fro_worker_name || 'No FRO'}
                </span>
                <span className="pill pill-blue" style={{ fontSize: 10, minWidth: 24, textAlign: 'center' }}>{getDonorCount(s.donor_count)}</span>
              </label>
            ))}
          </div>

          {/* Selection summary */}
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 8, padding: '6px 10px', background: 'var(--bg)', borderRadius: 4 }}>
            {selected.size > 0 ? (
              <>Selected <strong>{selected.size}</strong> station(s) — donors will be distributed round-robin across these stations.</>
            ) : (
              <>Select at least one station to distribute data.</>
            )}
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

const NGO_COLORS = {
  bsct: '#2563eb',
  aflf: '#16a34a',
  mann: '#ec4899',
};

const NGO_TABS = ['BSCT', 'AFLF', 'MANN'];

export default function NewData() {
  const [donors, setDonors] = useState([])
  const [loading, setLoading] = useState(true)
  const [distributing, setDistributing] = useState(false)
  const [result, setResult] = useState(null)
  const [showStationSelect, setShowStationSelect] = useState(false)
  const [stations, setStations] = useState([])
  const [selectedNgoId, setSelectedNgoId] = useState(null)
  const [accessibleNgos, setAccessibleNgos] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [perPage, setPerPage] = useState(500)
  const [showDistributeConfirm, setShowDistributeConfirm] = useState(false)
  const [distributeConfirmed, setDistributeConfirmed] = useState(false)
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false)
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetConfirmed, setResetConfirmed] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categoryOptions, setCategoryOptions] = useState([])

  useEffect(() => {
    apiGet('/ngo-admin/ngos').then(list => {
      setAccessibleNgos(list);
      const ngo = (list || []).find(n => NGO_TABS.includes(n.name));
      if (ngo) setSelectedNgoId(ngo.id);
    }).catch((err) => { console.error('Error:', err.message); });
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startRow = (page - 1) * perPage + 1;
  const endRow = Math.min(page * perPage, total);

  const load = () => {
    setLoading(true)
    const params = [];
    if (selectedNgoId !== 'all') params.push(`ngo_id=${selectedNgoId}`);
    if (categoryFilter) params.push(`category=${encodeURIComponent(categoryFilter)}`);
    params.push(`page=${page}`, `per_page=${perPage}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    Promise.all([
      apiGet(`/ngo-admin/new-data${query}`),
      apiGet(`/ngo-admin/stations${selectedNgoId && selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : ''}`),
    ]).then(([d, s]) => {
      setDonors(Array.isArray(d) ? d : d?.unassigned || [])
      setTotal(d?.total || 0)
      if (Array.isArray(d?.category_options)) setCategoryOptions(d.category_options)
      setStations(Array.isArray(s) ? s : [])
    }).catch((err) => { console.error('Error:', err.message); }).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1) }, [selectedNgoId])
  useEffect(() => { setPage(1) }, [categoryFilter])
  useEffect(load, [selectedNgoId, page, perPage, categoryFilter])

  const handleDistributeAll = async () => {
    const count = total
    if (count === 0) return
    setDistributeConfirmed(false)
    setShowDistributeConfirm(true)
  }

  const fdStations = stations.filter(s => s.station?.startsWith('FD-'))
  const currentNgoName = accessibleNgos.find(n => n.id === selectedNgoId)?.name || ''

  const executeDistributeAll = async () => {
    setShowDistributeConfirm(false)
    setDistributing(true)
    setResult(null)
    try {
      const body = { stations: fdStations.map(s => s.station) }
      if (selectedNgoId !== 'all') body.ngo_id = selectedNgoId
      if (categoryFilter) body.category = categoryFilter
      const res = await apiPost('/ngo-admin/new-data/distribute', body)
      setResult(res)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDistributing(false)
    }
  }

  const handleCleanupNewData = () => {
    if (total === 0) return
    setCleanupConfirmed(false)
    setShowCleanupConfirm(true)
  }

  const executeCleanup = async () => {
    setShowCleanupConfirm(false)
    setDistributing(true)
    setResult(null)
    try {
      const body = {}
      if (selectedNgoId !== 'all') body.ngo_id = selectedNgoId
      if (categoryFilter) body.category = categoryFilter
      const res = await apiPost('/ngo-admin/new-data/cleanup', body)
      setResult(res)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDistributing(false)
    }
  }

  const handleResetFreshData = () => {
    setResetConfirmed(false)
    setShowResetConfirm(true)
  }

  const executeReset = async () => {
    setShowResetConfirm(false)
    setDistributing(true)
    setResult(null)
    try {
      const body = {}
      if (selectedNgoId !== 'all') body.ngo_id = selectedNgoId
      const res = await apiPost('/ngo-admin/new-data/reset', body)
      setResult(res)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDistributing(false)
    }
  }

  return (
    <div>
      <div className="filter-bar">
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 2 }}>
          {NGO_TABS.map(name => {
            const ngo = accessibleNgos.find(n => n.name === name);
            const active = ngo && selectedNgoId === ngo.id;
            return (
              <button key={name} onClick={() => ngo && setSelectedNgoId(ngo.id)}
                style={{ padding: '5px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: active ? 'var(--sage)' : 'transparent', color: active ? '#fff' : 'var(--ink-soft)' }}>
                {name}
              </button>
            );
          })}
        </div>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
              Category:
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff' }}>
                <option value="">All Categories</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <span className="count">{total > 0 ? `Showing ${startRow}-${endRow} of ${total} donors` : `${total} donors`}</span>
            {fdStations.length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={handleDistributeAll} disabled={distributing || total === 0}>
                {distributing ? 'Distributing...' : `Distribute to All FD Stations (${fdStations.length})`}
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => setShowStationSelect(true)} disabled={total === 0}>
              Select Stations & Distribute
            </button>
            <button className="btn btn-sm" onClick={handleCleanupNewData} disabled={distributing || total === 0}
              style={{ fontSize: 11, color: '#dc2626', border: '1px solid #fca5a5', background: '#fef2f2' }}>
              Cleanup New Data
            </button>
            <button className="btn btn-sm" onClick={handleResetFreshData} disabled={distributing}
              style={{ fontSize: 11, color: '#7c3aed', border: '1px solid #d8b4fe', background: '#faf5ff' }}>
              Remove All New Data
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
                  <th>NGO</th>
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
                    <td>
                      {d.ngo ? (
                        <span style={{
                          display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                          color:'#fff', background: NGO_COLORS[d.ngo.toLowerCase()] || '#6b7280'
                        }}>
                          {d.ngo}
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td><span className="pill">{d.data_category || d.category || '\u2014'}</span></td>
                    <td>{'\u20B9'}{Number(d.amount || 0).toLocaleString()}</td>
                    <td className="muted">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {total > 0 && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--ink-soft)' }}>Rows per page:</span>
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
                  style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(1)} style={{ fontSize: 11 }}>«</button>
                <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ fontSize: 11 }}>‹</button>
                {(() => {
                  const pages = [];
                  const maxVisible = 7;
                  let startP = Math.max(1, page - Math.floor(maxVisible / 2));
                  let endP = Math.min(totalPages, startP + maxVisible - 1);
                  if (endP - startP < maxVisible - 1) startP = Math.max(1, endP - maxVisible + 1);
                  for (let p = startP; p <= endP; p++) {
                    pages.push(
                      <button key={p} className="btn btn-sm" onClick={() => setPage(p)}
                        style={{ fontSize: 11, fontWeight: p === page ? 700 : 400, background: p === page ? 'var(--sage)' : 'transparent', color: p === page ? '#fff' : 'inherit', border: p === page ? 'none' : '1px solid var(--line)' }}>
                        {p}
                      </button>
                    );
                  }
                  return pages;
                })()}
                <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ fontSize: 11 }}>›</button>
                <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(totalPages)} style={{ fontSize: 11 }}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showStationSelect && (
        <StationSelectModal
          stations={stations}
          onClose={() => setShowStationSelect(false)}
          onDistribute={(res) => { setShowStationSelect(false); setResult(res); load() }}
          ngoId={selectedNgoId}
          ngoName={currentNgoName}
          category={categoryFilter}
        />
      )}

      {showDistributeConfirm && (
        <div className="modal-overlay" onClick={() => setShowDistributeConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <h3>Confirm Distribution</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowDistributeConfirm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Donors to distribute:</span>
                  <strong>{Number(total).toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-soft)' }}>NGO:</span>
                  <strong>{accessibleNgos.find(n => n.id === selectedNgoId)?.name || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Category:</span>
                  <strong style={{ color: categoryFilter ? 'var(--sage)' : 'inherit' }}>{categoryFilter || 'All Categories'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-soft)' }}>FD Stations:</span>
                  <strong>{fdStations.length}</strong>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '8px 12px', borderRadius: 6, background: distributeConfirmed ? '#f0fdf4' : '#f9fafb', border: `1px solid ${distributeConfirmed ? '#86efac' : 'var(--line)'}`, transition: 'all .15s' }}>
                <input type="checkbox" checked={distributeConfirmed} onChange={e => setDistributeConfirmed(e.target.checked)} />
                <span>I confirm I want to distribute this data{categoryFilter ? ` (${categoryFilter})` : ''} to <strong>all FD stations</strong> ({fdStations.length})</span>
              </label>

              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowDistributeConfirm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={executeDistributeAll} disabled={!distributeConfirmed}>
                  Proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCleanupConfirm && (
        <div className="modal-overlay" onClick={() => setShowCleanupConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <h3>Cleanup New Data</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCleanupConfirm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fef2f2', borderRadius: 8, padding: '14px 16px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600, marginBottom: 6 }}>⚠ This will delete undistributed new data</div>
                <div style={{ fontSize: 12, color: '#991b1b' }}>
                  {total} unassigned donor record(s){categoryFilter ? ` for category "${categoryFilter}"` : ''} in <strong>{currentNgoName || 'All NGOs'}</strong> will be permanently removed from the new_data table.
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                  Already distributed data (assigned to FROs) will NOT be affected. Old data and donor profiles remain safe.
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '8px 12px', borderRadius: 6, background: cleanupConfirmed ? '#fef2f2' : '#f9fafb', border: `1px solid ${cleanupConfirmed ? '#fca5a5' : 'var(--line)'}`, transition: 'all .15s' }}>
                <input type="checkbox" checked={cleanupConfirmed} onChange={e => setCleanupConfirmed(e.target.checked)} />
                <span>I understand this will permanently delete <strong>{total}</strong> undistributed records{categoryFilter ? ` (${categoryFilter})` : ''}</span>
              </label>

              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowCleanupConfirm(false)}>Cancel</button>
                <button className="btn" onClick={executeCleanup} disabled={!cleanupConfirmed}
                  style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
                  Delete Undistributed Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h3>Remove All New Data</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowResetConfirm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#faf5ff', borderRadius: 8, padding: '14px 16px', border: '1px solid #d8b4fe' }}>
                <div style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600, marginBottom: 6 }}>⚠ This will remove ALL new data for <strong>{currentNgoName || 'All NGOs'}</strong></div>
                <div style={{ fontSize: 12, color: '#6b21a8' }}>
                  Deletes: <br />
                  • All fro_assignments on FD stations<br />
                  • All new_data records (distributed + undistributed)<br />
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                  Old data, old station assignments, and donor profiles will NOT be touched. Use this to start fresh before re-uploading.
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '8px 12px', borderRadius: 6, background: resetConfirmed ? '#faf5ff' : '#f9fafb', border: `1px solid ${resetConfirmed ? '#d8b4fe' : 'var(--line)'}`, transition: 'all .15s' }}>
                <input type="checkbox" checked={resetConfirmed} onChange={e => setResetConfirmed(e.target.checked)} />
                <span>I understand this will remove all FD assignments and new data records</span>
              </label>

              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowResetConfirm(false)}>Cancel</button>
                <button className="btn" onClick={executeReset} disabled={!resetConfirmed}
                  style={{ background: '#7c3aed', color: '#fff', border: 'none' }}>
                  Remove All New Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}