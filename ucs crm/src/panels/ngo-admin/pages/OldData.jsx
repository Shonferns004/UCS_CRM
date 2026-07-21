import { useState, useEffect, useMemo } from 'react';
import { apiGet } from '../api/auth';

const PER_PAGE = 50;

const statusLabel = (s) => {
  const labels = {
    pending: 'Pending', contacted: 'Contacted', scheduled: 'Scheduled',
    callback: 'Callback', follow_up: 'Follow Up', busy: 'Busy',
    ringing: 'Ringing', unreachable: 'Unreachable', switched_off: 'Switched Off',
    wrong_number: 'Wrong Number', invalid_number: 'Invalid', rejected: 'Rejected',
    lead_done: 'Lead Done', visit_donate: 'Visit & Donate',
    promise_to_pay: 'Promise to Pay', payment_pending: 'Payment Pending',
    already_donated: 'Already Donated', not_interested: 'Not Interested',
    not_interested_now: 'Not Interested Now', language_barrier: 'Language Barrier',
    transferred_senior: 'Transferred to Senior', query_complaint: 'Query/Complaint',
    receipt_request: 'Receipt Request', donation_collected: 'Donation Collected',
  };
  return labels[s] || s || '\u2014';
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '\u2014';
const fmtAmt = (n) => n != null && n !== '' ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';

export default function OldData() {
  const [donors, setDonors] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [station, setStation] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiGet('/ngo-admin/stations').then(r => {
      const list = Array.isArray(r) ? r.map(s => s.station || s).filter(Boolean).sort() : [];
      setStations(list);
    }).catch(() => {});
  }, []);

  const load = async (st) => {
    if (!st) { setDonors([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiGet(`/ngo-admin/donors-by-station?station=${encodeURIComponent(st)}`);
      setDonors(Array.isArray(data) ? data : []);
    } catch { setDonors([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(station); setPage(1); }, [station]);

  const duplicateMobiles = useMemo(() => {
    const counts = {};
    donors.forEach(d => {
      const m = d.donor_mobile;
      if (m) counts[m] = (counts[m] || 0) + 1;
    });
    const dupSet = new Set();
    for (const [m, c] of Object.entries(counts)) {
      if (c > 1) dupSet.add(m);
    }
    return dupSet;
  }, [donors]);

  const filtered = useMemo(() => {
    if (!search) return donors;
    const q = search.toLowerCase();
    return donors.filter(d =>
      (d.donor_name || '').toLowerCase().includes(q) ||
      (d.donor_mobile || '').includes(q)
    );
  }, [donors, search]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search]);

  return (
    <div>
      <div className="card-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Old Data (Station Wise)</h3>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12, gap: 10 }}>
        <select value={station} onChange={e => setStation(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', minWidth: 200 }}>
          <option value="">-- Select Station --</option>
          {stations.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="Search name or mobile..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', width: 280 }} />
        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
          {station ? `${filtered.length} donors` : 'Select a station'}
        </span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sr. No.</th>
                <th>Station</th>
                <th>Agent Name</th>
                <th>Donor Name</th>
                <th>Mobile No</th>
                <th>Mobile No 2</th>
                <th>Amount</th>
                <th>Data Category</th>
                <th>Call Date</th>
                <th>Disposition</th>
                <th>Call Back Date</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {!station ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30, color: 'var(--ink-soft)' }}>Select a station to view data</td></tr>
              ) : loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30, color: 'var(--ink-soft)' }}>Loading...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30, color: 'var(--ink-soft)' }}>No donors found for this station</td></tr>
              ) : paginated.map((d, i) => {
                const isDup = duplicateMobiles.has(d.donor_mobile);
                return (
                  <tr key={d.id || i} style={isDup ? { background: '#fef2f2' } : {}}>
                    <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{(page - 1) * PER_PAGE + i + 1}</td>
                    <td>{d.station || '\u2014'}</td>
                    <td>{d.fro_name || '\u2014'}</td>
                    <td>
                      {d.donor_name || '\u2014'}
                      {isDup && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#dc2626', color: '#fff', fontWeight: 600 }}>DUP</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{d.donor_mobile || '\u2014'}</td>
                    <td style={{ fontSize: 12 }}>{d.donor_mobile_2 || '\u2014'}</td>
                    <td style={{ fontWeight: 600 }}>{fmtAmt(d.amount)}</td>
                    <td style={{ fontSize: 11 }}>{d.data_category || '\u2014'}</td>
                    <td style={{ fontSize: 11 }}>{fmtDate(d.last_contacted_at)}</td>
                    <td><span className={`pill ${statusLabel(d.status) !== '\u2014' ? 'pill-blue' : ''}`} style={{ fontSize: 10 }}>{statusLabel(d.status)}</span></td>
                    <td style={{ fontSize: 11 }}>{fmtDate(d.next_follow_up)}</td>
                    <td style={{ fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes || '\u2014'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {station && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
            <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Page {page} of {totalPages}</span>
            <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}