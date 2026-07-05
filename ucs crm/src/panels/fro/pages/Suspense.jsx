import { useState, useEffect } from 'react';
import { api } from '../../../api/auth';

const apiGet = (p) => api(p, { _prefix: 'ucs' });
const apiPut = (p, b) => api(p, { method: 'PUT', body: JSON.stringify(b), _prefix: 'ucs' });
const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';

export default function FroSuspense() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [donorDetails, setDonorDetails] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/accounts/bank-audit/fro-suspense');
      setEntries(data || []);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async (id) => {
    if (!donorDetails) { alert('Please provide donor details'); return; }
    try {
      await apiPut('/accounts/bank-audit/fro-suspense/' + id + '/resolve', { screenshot_url: screenshotUrl, donor_details: donorDetails });
      setResolving(null);
      setScreenshotUrl('');
      setDonorDetails('');
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="card-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Assigned Suspense</h3>
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
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No suspense assigned</td></tr>
              ) : (
                entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12 }}>{e.payment_id || '\u2014'}</td>
                    <td><span className="pill pill-gray">{e.bank_audit_sources?.name || 'Unknown'}</span></td>
                    <td><strong style={{ color: '#dc2626' }}>{currency(e.amount)}</strong></td>
                    <td style={{ fontSize: 12 }}>{e.transaction_date || '\u2014'}</td>
                    <td>{e.status === 'verified' ? <span className="pill pill-green">Resolved</span> : <span className="pill pill-yellow">Pending</span>}</td>
                    <td>
                      {resolving === e.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
                          <input placeholder="Screenshot URL" value={screenshotUrl} onChange={e2 => setScreenshotUrl(e2.target.value)}
                            style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4 }} />
                          <textarea placeholder="Donor details (name, mobile, etc.)" value={donorDetails} onChange={e2 => setDonorDetails(e2.target.value)}
                            rows={2} style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4 }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-primary" onClick={() => handleResolve(e.id)}>Submit</button>
                            <button className="btn btn-sm" onClick={() => { setResolving(null); setScreenshotUrl(''); setDonorDetails(''); }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-sm" onClick={() => setResolving(e.id)} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--sage)', color: '#fff', border: 'none' }}>
                          Resolve
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
