import { useState, useEffect, useRef } from 'react';
import { getSuspenseReceipts, claimSuspenseReceipt, searchDonorsByMobile } from '../api/donors';
import { useRealtime } from '../../../hooks/useRealtime';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';

const CLAIM_BADGES = {
  pending: { text: 'Claimed · Pending', color: '#b45309', bg: '#fef3c7' },
  verified: { text: 'Claim Verified', color: '#166534', bg: '#dcfce7' },
  rejected: { text: 'Claim Rejected', color: '#b91c1c', bg: '#fee2e2' },
};

const NGO_LABELS = { bsct: 'Being Sevak', maan: 'Mann Care', aflf: 'Ashray' };

export default function FroSuspense() {
  const [month, setMonth] = useState('');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ngoFilter, setNgoFilter] = useState('');
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimReceipt, setClaimReceipt] = useState(null);
  const [claimNotes, setClaimNotes] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimDonor, setClaimDonor] = useState(null);
  const [claimSearch, setClaimSearch] = useState('');
  const [claimResults, setClaimResults] = useState([]);
  const [claimSearching, setClaimSearching] = useState(false);
  const claimTimer = useRef(null);

  const load = async () => {
    try {
      const data = await getSuspenseReceipts();
      setMonth(data?.month || '');
      setReceipts(data?.receipts || []);
    } catch (err) {
      console.error('API error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getSuspenseReceipts();
        if (!cancelled) {
          setMonth(data?.month || '');
          setReceipts(data?.receipts || []);
        }
      } catch (err) { console.error('API error:', err.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useRealtime('receipts', {
    event: '*',
    onInsert: () => load(),
    onUpdate: () => load(),
    onDelete: () => load(),
  });

  const openClaimModal = (r) => {
    setClaimReceipt(r);
    setClaimNotes('');
    setClaimError('');
    setClaimSuccess(false);
    setClaimDonor(null);
    setClaimSearch('');
    setClaimResults([]);
    setShowClaimModal(true);
  };

  const searchClaimDonors = (q) => {
    setClaimSearch(q);
    clearTimeout(claimTimer.current);
    if ((q || '').trim().length < 2) { setClaimResults([]); setClaimSearching(false); return; }
    claimTimer.current = setTimeout(async () => {
      setClaimSearching(true);
      try {
        const res = await searchDonorsByMobile(q.trim());
        setClaimResults(Array.isArray(res) ? res : []);
      } catch (err) {
        setClaimResults([]);
      } finally {
        setClaimSearching(false);
      }
    }, 350);
  };

  const submitClaim = async () => {
    if (!claimReceipt) return;
    if (!claimDonor) { setClaimError('Select the donor to claim this receipt'); return; }
    setClaiming(true);
    setClaimError('');
    try {
      await claimSuspenseReceipt(claimReceipt.id, { donor_id: claimDonor.id, notes: claimNotes.trim() || undefined });
      setClaimSuccess(true);
      const data = await getSuspenseReceipts();
      setMonth(data?.month || '');
      setReceipts(data?.receipts || []);
      setTimeout(() => setShowClaimModal(false), 1200);
    } catch (err) {
      setClaimError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  const ngos = [...new Set((receipts || []).map(r => r.project_id).filter(Boolean))];
  const filtered = ngoFilter ? (receipts || []).filter(r => r.project_id === ngoFilter) : (receipts || []);
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div>
      <div className="card-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Suspense Receipts</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {ngos.length > 0 && (
            <select value={ngoFilter} onChange={e => setNgoFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 11, fontFamily: 'inherit', background: '#fff', cursor: 'pointer', outline: 'none' }}>
              <option value="">All NGOs</option>
              {ngos.map(p => (
                <option key={p} value={p}>{NGO_LABELS[p] || p.toUpperCase()}</option>
              ))}
            </select>
          )}
          <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600 }}>
            {month} · {loading ? '...' : `${filtered.length} unclaimed`}
            {!loading && filtered.length > 0 ? ` · ${currency(total)} total` : ''}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
        Unlinked donations received in {month} waiting for an owner. Claim one to get credit after accounts verification.
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Receipt No</th>
                <th>Donor</th>
                <th>Mobile</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)' }}>Loading suspense receipts...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 6 }}>check_circle</span>
                  No suspense receipts{ngoFilter ? ' for this NGO' : ''} this month.
                </td></tr>
              ) : (
                filtered.map(r => {
                  const badge = CLAIM_BADGES[r.my_claim_status];
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>#{r.receipt_no || r.id}</td>
                      <td style={{ fontSize: 12.5, fontWeight: 600 }}>{r.donor_name || 'Unknown donor'}</td>
                      <td style={{ fontSize: 12 }}>{r.donor_mobile || '\u2014'}</td>
                      <td style={{ fontSize: 12 }}>{r.receipt_date || '\u2014'}</td>
                      <td><strong style={{ color: 'var(--ink)' }}>{currency(r.amount)}</strong></td>
                      <td>
                        {badge ? (
                          <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', background: badge.bg, color: badge.color }}>{badge.text}</span>
                        ) : (
                          <span className="pill pill-gray">Unclaimed</span>
                        )}
                      </td>
                      <td>
                        {!badge && (
                          <button className="btn btn-sm" onClick={() => openClaimModal(r)} style={{ fontSize: 11, padding: '3px 12px', background: 'var(--sage)', color: '#fff', border: 'none' }}>
                            Claim
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showClaimModal && claimReceipt && (
        <div onClick={() => { if (!claiming && !claimSuccess) setShowClaimModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 400, maxWidth: '92vw', padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Claim Suspense Receipt</div>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginBottom: 12 }}>Your claim becomes a pending lead in Lead Verification. Accounts verifies it and adds it to your collected.</div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{claimReceipt.donor_name || 'Unknown donor'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                Receipt #{claimReceipt.receipt_no || claimReceipt.id} · {claimReceipt.receipt_date}
                {claimReceipt.donor_mobile ? ` · ${claimReceipt.donor_mobile}` : ''}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sage)', marginTop: 6 }}>{currency(claimReceipt.amount)}</div>
            </div>
            {claimSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--sage)', fontWeight: 600, fontSize: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>check_circle</span>
                Claim submitted — pending in Lead Verification
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6 }}>SELECT DONOR</div>
                {claimDonor ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', border: '1px solid var(--sage)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{claimDonor.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>{claimDonor.mobile_number || '—'}{claimDonor.city ? ` · ${claimDonor.city}` : ''}</div>
                    </div>
                    <button onClick={() => { setClaimDonor(null); setClaimSearch(''); setClaimResults([]) }}
                      style={{ border: 'none', background: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
                  </div>
                ) : (
                  <>
                    <input
                      value={claimSearch}
                      onChange={e => searchClaimDonors(e.target.value)}
                      placeholder="Search donor by name or mobile..."
                      style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                    />
                    {claimSearching && <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 6 }}>Searching...</div>}
                    {!claimSearching && claimResults.length > 0 && (
                      <div style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 8, maxHeight: 150, overflowY: 'auto' }}>
                        {claimResults.map(d => (
                          <div key={d.id} onClick={() => { setClaimDonor(d); setClaimResults([]) }}
                            style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--line)', fontSize: 11.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.name}</span>
                            <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{d.mobile_number || ''}{d.city ? ` · ${d.city}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <textarea value={claimNotes} onChange={e => setClaimNotes(e.target.value)} rows={2}
                  placeholder="Optional note for accounts (how you know this donor)..."
                  style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginTop: 8 }} />
                {claimError && <div style={{ fontSize: 10.5, color: '#b91c1c', marginTop: 6 }}>{claimError}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button onClick={() => setShowClaimModal(false)} disabled={claiming}
                    style={{ padding: '7px 16px', border: '1px solid var(--line)', borderRadius: 6, background: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={submitClaim} disabled={claiming || !claimDonor}
                    style={{ padding: '7px 16px', border: 'none', borderRadius: 6, background: 'var(--sage)', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: (claiming || !claimDonor) ? .5 : 1 }}>
                    {claiming ? 'Claiming...' : 'Submit Claim'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
