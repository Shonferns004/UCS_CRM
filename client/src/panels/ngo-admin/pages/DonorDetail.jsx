import { useState, useEffect } from 'react';
import { apiGet } from '../api/auth';

export default function DonorDetail({ donor, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet(`/ngo-admin/donors/${donor.mobile_number}`)
      .then(r => setData(r))
      .catch((err) => { console.error('Error:', err.message); })
      .finally(() => setLoading(false));
  }, [donor.mobile_number]);

  if (loading) return <div className="loading">Loading donor details...</div>;
  if (!data) return <div className="empty-state"><p>Could not load donor details.</p></div>;

  const p = data.profile;
  const donations = data.donations || [];

  return (
    <div>
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>{'\u{2190}'}</button>
        <h2>Donor Details</h2>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Contact Information</h3>
        </div>
        <div className="card-pad">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <div><strong>Name:</strong> {p.name || '—'}</div>
            <div><strong>Phone:</strong> {p.mobile_number}</div>
            <div><strong>City:</strong> {p.city || '—'}</div>
            <div><strong>Station:</strong> {p.station || '—'}</div>
            <div><strong>NGO:</strong> {p.ngo || '—'}</div>
            <div><strong>Email:</strong> {p.email || '—'}</div>
            <div><strong>Address:</strong> {p.address_1 || '—'}{p.address_2 ? `, ${p.address_2}` : ''}</div>
            <div><strong>PAN:</strong> {p.pan_number || '—'}</div>
            <div><strong>MOP:</strong> {p.mop || '—'}</div>
            <div><strong>Agent:</strong> {p.agent_donor_name || '—'}</div>
            <div><strong>Team:</strong> {p.team || '—'}</div>
            <div><strong>Project:</strong> {p.project_supported || '—'}</div>
            <div><strong>Bank:</strong> {p.donors_bank_name || '—'}</div>
            <div><strong>Account Of:</strong> {p.account_of || '—'}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Donation Summary</h3>
        </div>
        <div className="card-pad">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Max Donation</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>₹{Number(p.amount || 0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Donated</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>₹{Number(p.total_amount || 0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Donations</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.donation_count || 1}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Since</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{p.first_donation_date ? new Date(p.first_donation_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Donation History ({donations.length} records)</h3>
        </div>
        <div className="card-pad" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Project</th>
                <th>Team</th>
                <th>Agent</th>
                <th>MOP</th>
                <th>Receipt No</th>
              </tr>
            </thead>
            <tbody>
              {donations.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{i + 1}</td>
                  <td>{d.transaction_date ? new Date(d.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td style={{ fontWeight: 600 }}>₹{Number(d.amount || 0).toLocaleString('en-IN')}</td>
                  <td><span className="pill pill-blue">{d.category || '—'}</span></td>
                  <td>{d.project_supported || '—'}</td>
                  <td>{d.team || '—'}</td>
                  <td>{d.agent_donor_name || d.bank_donor_name || '—'}</td>
                  <td>{d.mop || '—'}</td>
                  <td style={{ fontSize: 12 }}>{d.receipt_no || '—'}</td>
                </tr>
              ))}
              {donations.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-soft)' }}>No donation records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
