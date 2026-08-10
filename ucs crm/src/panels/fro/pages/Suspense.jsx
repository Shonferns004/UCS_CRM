import { useState, useEffect, useRef, useMemo } from 'react';
import { Inbox, Search, ChevronRight, Phone, ReceiptText } from 'lucide-react';
import { getSuspenseReceipts, claimSuspenseReceipt, searchDonorsByMobile } from '../api/donors';
import { useRealtime } from '../../../hooks/useRealtime';
import { SkeletonTable } from '../../../components/Skeleton';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014';

const CLAIM_BADGES = {
  pending: { text: 'Claimed · Pending', color: '#b45309', bg: '#fef3c7' },
  verified: { text: 'Claim Verified', color: '#166534', bg: '#dcfce7' },
  rejected: { text: 'Claim Rejected', color: '#b91c1c', bg: '#fee2e2' },
};

const NGO_LABELS = { bsct: 'Being Sevak', maan: 'Mann Care', aflf: 'Ashray' };
const NGO_SHORT = { bsct: 'BSCT', maan: 'MANN', aflf: 'AFLF' };

const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

export default function FroSuspense() {
  const [month, setMonth] = useState('');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ngoFilter, setNgoFilter] = useState('');
  const [query, setQuery] = useState('');
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

  const list = useMemo(() => {
    let base = ngoFilter ? (receipts || []).filter(r => r.project_id === ngoFilter) : (receipts || []);
    const q = query.trim().toLowerCase();
    if (q) base = base.filter(r => (r.donor_name || '').toLowerCase().includes(q) || (r.donor_mobile || '').includes(q));
    return base;
  }, [receipts, ngoFilter, query]);

  const totalAmount = list.reduce((s, r) => s + Number(r.amount || 0), 0);

  if (loading) return <div style={{ padding: 18 }}><SkeletonTable rows={8} /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar: NGO pill tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 18px', flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
          {[['', 'All']].concat(ngos.map(p => [p, NGO_SHORT[p] || p.toUpperCase()])).map(([v, l]) => {
            const count = v ? receipts.filter(r => r.project_id === v).length : receipts.length;
            const active = ngoFilter === v;
            return (
              <button key={v || 'all'} onClick={() => setNgoFilter(v)}
                style={{
                  padding: '6px 16px', borderRadius: 999, border: 'none', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: active ? 'var(--sage)' : 'transparent', color: active ? '#fff' : 'var(--ink-soft)',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,.18)' : 'none', transition: 'all .15s',
                }}>
                {l}
                <span style={{
                  minWidth: 17, padding: '0 5px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                  background: active ? 'rgba(255,255,255,.22)' : 'var(--line)', color: active ? '#fff' : 'var(--ink-soft)',
                }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or mobile…"
            style={{
              padding: '7px 12px 7px 30px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--card-bg)',
              fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 210, color: 'var(--ink)',
            }}
          />
        </div>
      </div>

      {/* Month strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 18px 8px', flexShrink: 0, fontSize: 11, color: 'var(--ink-soft)' }}>
        <span>Unlinked donations received in <b style={{ color: 'var(--ink)' }}>{month}</b> waiting for an owner. Claim one to get credit after accounts verification.</span>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{currency(totalAmount)} · {list.length}</span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 18px 18px' }}>
        {list.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 220, gap: 10, color: 'var(--ink-soft)' }}>
            <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Inbox size={24} />
            </span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{query ? 'No matching receipts' : 'No suspense receipts'}{ngoFilter ? ' for this NGO' : ''}</div>
            <div style={{ fontSize: 11 }}>{query ? 'Try a different name or mobile number.' : 'New suspense receipts will appear here.'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(r => {
              const badge = CLAIM_BADGES[r.my_claim_status];
              const claimable = !r.my_claim_status;
              return (
                <div key={r.id} onClick={() => claimable && openClaimModal(r)}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--sage)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow)', cursor: claimable ? 'pointer' : 'default', transition: 'transform .12s, box-shadow .12s, border-color .12s',
                  }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#B5603A1A', color: '#B5603A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {initials(r.donor_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.donor_name || 'Unknown donor'}</span>
                      {badge && (
                        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color }}>
                          {badge.text}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                      <ReceiptText size={11} />
                      <span>#{r.receipt_no || r.id}</span>
                      <span style={{ color: 'var(--line)', margin: '0 3px' }}>•</span>
                      <Phone size={11} />
                      <span>{r.donor_mobile || '\u2014'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {r.receipt_date || '\u2014'}{r.receipt_time ? ` · ${r.receipt_time}` : ''}
                      <span style={{ color: 'var(--line)', margin: '0 3px' }}>•</span>
                      {NGO_SHORT[r.project_id] || NGO_LABELS[r.project_id] || r.project_id}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{currency(r.amount)}</div>
                    {claimable && (
                      <button
                        onClick={e => { e.stopPropagation(); openClaimModal(r); }}
                        className="btn btn-sm"
                        style={{ fontSize: 11, padding: '3px 12px', background: 'var(--sage)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginTop: 4 }}>
                        Claim
                      </button>
                    )}
                    {r.claim_count > 1 && !claimable && (
                      <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 3 }}>{r.claim_count} claims</div>
                    )}
                  </div>
                  {claimable && <ChevronRight size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showClaimModal && claimReceipt && (
        <div onClick={() => { if (!claiming && !claimSuccess) setShowClaimModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 400, maxWidth: '92vw', padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Claim Suspense Receipt</div>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginBottom: 12 }}>Your claim becomes a pending lead in Lead Verification. Accounts verifies it and adds it to your collected.</div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{claimReceipt.donor_name || 'Unknown donor'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                Receipt #{claimReceipt.receipt_no || claimReceipt.id} · {claimReceipt.receipt_date}
                {claimReceipt.receipt_time ? ` · ${claimReceipt.receipt_time}` : ''}
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
                    {!claimSearching && claimSearch.trim().length >= 2 && claimResults.length === 0 && (
                      <div style={{ marginTop: 6, padding: '10px 12px', border: '1px dashed var(--line)', borderRadius: 8, textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', background: 'var(--bg)' }}>
                        No donor found
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
