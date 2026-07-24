import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiGet, apiPost } from '../api/auth';
import { toast } from '../../../components/Toast';

function AssignModal({ donors, froWorkers, onClose, onAssigned }) {
  const [selectedWorker, setSelectedWorker] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!selectedWorker) return;
    setLoading(true);
    try {
      const ids = donors.map(d => d.id);
      await apiPost('/ngo-admin/assignments', { donor_ids: ids, fro_worker_id: selectedWorker });
      onAssigned();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Assign {donors.length} Donor(s)</h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Select FRO Worker</label>
            <select value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}>
              <option value="">-- Choose FRO --</option>
              {froWorkers.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.login_id})</option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-soft)' }}>
            Assigning to: {donors.slice(0, 3).map(d => d.name || d.mobile_number).join(', ')}
            {donors.length > 3 && ` and ${donors.length - 3} more`}
          </div>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAssign} disabled={loading || !selectedWorker}>
              {loading ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PER_PAGE = 50;

export default function Donors({ onSelect }) {
  const [donors, setDonors] = useState([]);
  const [froWorkers, setFroWorkers] = useState([]);
  const [search, setSearch] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [showAssign, setShowAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedNgoId, setSelectedNgoId] = useState('all');
  const [accessibleNgos, setAccessibleNgos] = useState([]);

  useEffect(() => {
    apiGet('/ngo-admin/ngos').then(setAccessibleNgos).catch((err) => { console.error('Error:', err.message); });
  }, []);

  const load = () => {
    setLoading(true);
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    Promise.all([
      apiGet(`/ngo-admin/donors${ngoParam}`),
      apiGet('/ngo-admin/fro-workers'),
    ]).then(([d, f]) => {
      setDonors(d);
      setFroWorkers(f);
    }).catch((err) => { console.error('Error:', err.message); }).finally(() => setLoading(false));
  };

  useEffect(load, [selectedNgoId]);

  const stations = useMemo(() => {
    const s = new Set();
    donors.forEach(d => { if (d.station) s.add(d.station); });
    return [...s].sort();
  }, [donors]);

  const filtered = useMemo(() => {
    return donors.filter(d => {
      if (stationFilter && d.station !== stationFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (d.name && d.name.toLowerCase().includes(q)) ||
             (d.mobile_number && d.mobile_number.includes(q)) ||
             (d.city && d.city.toLowerCase().includes(q)) ||
             (d.station && d.station.toLowerCase().includes(q)) ||
             (d.ngo && d.ngo.toLowerCase().includes(q));
    });
  }, [donors, search, stationFilter]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  useEffect(() => { setPage(1); }, [search, stationFilter]);

  useEffect(() => { setSelected(new Set()); }, [page]);

  const toggleAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map(d => d.id)));
    }
  };

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedDonors = donors.filter(d => selected.has(d.id));

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
      <div className="card">
        <div className="card-head">
          <h3>Donor Profiles</h3>
          {selected.size > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAssign(true)}>
              Assign to FRO ({selected.size})
            </button>
          )}
        </div>
        <div className="card-pad">
          <div className="filter-bar">
            <input placeholder="Search name, phone, city..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
            <select value={stationFilter} onChange={e => { setStationFilter(e.target.value); setSelected(new Set()); }} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line, #e5e7eb)' }}>
              <option value="">All Stations</option>
              {stations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="count">{filtered.length} donors</span>
            {totalPages > 1 && <span className="count" style={{ background: '#eef2ff', color: '#6366f1' }}>Page {page} of {totalPages}</span>}
          </div>
          {loading ? (
            <div className="loading">Loading donors...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="checkbox-col"><input type="checkbox" checked={paginated.length > 0 && selected.size === paginated.length} onChange={toggleAll} /></th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Station</th>
                  <th>NGO</th>
                  <th>Amount</th>
                  <th>Donations</th>
                  <th>Last</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(d => (
                  <tr key={d.id}>
                    <td className="checkbox-col"><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} /></td>
                    <td><a className="link" onClick={() => onSelect?.(d)} style={{ cursor: 'pointer' }}>{d.name || '—'}</a></td>
                    <td>{d.mobile_number}</td>
                    <td>{d.city || '—'}</td>
                    <td>{d.station || '—'}</td>
                    <td>{d.ngo || '—'}</td>
                    <td>₹{Number(d.amount || 0).toLocaleString('en-IN')}</td>
                    <td>{d.donation_count || 1}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{d.last_donation_date ? new Date(d.last_donation_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</td>
                    <td><span className="pill pill-blue">{d.data_category || d.category || 'General'}</span></td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No donors found</td></tr>
                )}
              </tbody>
            </table>
          )}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
              <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p)} style={{ minWidth: 36 }}>
                  {p}
                </button>
              ))}
              <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>
      {showAssign && (
        <AssignModal
          donors={selectedDonors}
          froWorkers={froWorkers}
          onClose={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); setSelected(new Set()); load(); }}
        />
      )}
    </div>
  );
}
