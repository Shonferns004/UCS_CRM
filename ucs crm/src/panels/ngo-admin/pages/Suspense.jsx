import { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../api/auth';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

export default function Suspense() {
  const [entries, setEntries] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);
  const [froId, setFroId] = useState('');
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [entriesData, workersData] = await Promise.all([
        apiGet('/accounts/bank-audit/ngo-suspense'),
        apiGet('/workers?department=FRO'),
      ]);
      setEntries(entriesData || []);
      setWorkers(workersData || []);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async (id) => {
    if (!froId) { alert('Please select an FRO'); return; }
    try {
      await apiPut('/accounts/bank-audit/ngo-suspense/' + id + '/assign-fro', { fro_id: froId, notes });
      setAssigning(null);
      setFroId('');
      setNotes('');
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="card-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Suspense Entries</h3>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Source</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No suspense entries</td></tr>
              ) : (
                entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12 }}>{e.payment_id || '\u2014'}</td>
                    <td><span className="pill pill-gray">{e.bank_audit_sources?.name || 'Unknown'}</span></td>
                    <td><strong style={{ color: '#dc2626' }}>{currency(e.amount)}</strong></td>
                    <td style={{ fontSize: 12 }}>{e.transaction_date || '\u2014'}</td>
                    <td style={{ fontSize: 12, maxWidth: 150, whiteSpace: 'pre-wrap' }}>{e.ngo_admin_notes || '\u2014'}</td>
                    <td>
                      {assigning === e.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                          <select value={froId} onChange={e => setFroId(e.target.value)}
                            style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4 }}>
                            <option value="">Select FRO...</option>
                            {workers.map(w => (
                              <option key={w.id} value={w.id}>{w.name} ({w.login_id})</option>
                            ))}
                          </select>
                          <input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)}
                            style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4 }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-primary" onClick={() => handleAssign(e.id)}>Assign</button>
                            <button className="btn btn-sm" onClick={() => { setAssigning(null); setFroId(''); setNotes(''); }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-sm" onClick={() => setAssigning(e.id)} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--sage)', color: '#fff', border: 'none' }}>
                          Assign to FRO
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
