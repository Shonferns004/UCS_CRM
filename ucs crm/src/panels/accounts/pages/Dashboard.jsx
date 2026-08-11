import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiGet, apiDelete } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';
import LeadDetail from './LeadDetail';
import RightPanel from '../components/RightPanel';
import Pagination from '../components/Pagination';
import * as XLSX from 'xlsx';
import { receivedMeta } from '../services/receivedSource';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const NGO_LABELS = { bsct: 'Being Sevak', maan: 'Mann Care', aflf: 'Ashray' };
const LEAD_EXPORT_HEADERS = ['Branch','Transaction Date','Caller Name','Donor Name','Mobile No.','Len','Count','Mobil No. 2 / Tel','Len','Address 1','Address-2','Station','East / West','City','Pin Code','Pan. No.','Len','Mail Id','Birth Date','Data Category','Mobile','Station','Android No','Team','Agent Name','FSE Name','MOP','Received Bank','Payment Id No.','Len','Count','Donors Bank Name','Amount','Receipt No','Receipt Book No','Transaction Date','Time','Project Supported','Account of','Remark-1','Branch'];

const SkeletonNum = () => (
  <span className="sk-num" style={{ display:'inline-block',width:48,height:24,borderRadius:6,background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)',backgroundSize:'200% 100%',animation:'sk-shimmer 1.4s infinite'}} />
);

const SkeletonCard = () => (
  <div className="entry-card">
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <span className="sk-num" style={{ display:'inline-block', width:36, height:36, borderRadius:'50%', background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
      <div style={{ flex:1 }}>
        <span className="sk-num" style={{ display:'block', width:'70%', height:14, borderRadius:4, background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
        <span className="sk-num" style={{ display:'block', width:'45%', height:10, borderRadius:4, marginTop:6, background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
      </div>
    </div>
    <span className="sk-num" style={{ display:'block', width:64, height:20, borderRadius:6, marginTop:12, background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
    <span className="sk-num" style={{ display:'block', width:'55%', height:10, borderRadius:4, marginTop:10, background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)', backgroundSize:'200% 100%', animation:'sk-shimmer 1.4s infinite' }} />
  </div>
);

const StatCard = ({ icon, label, value, sub, color, loading: l }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: color + '18', color }}>{icon}</div>
    <div className="stat-info">
      {l ? <SkeletonNum /> : <div className="stat-num">{value}</div>}
      <div className="stat-lbl">{label}</div>
      {sub && <div className="stat-sub">{l ? <span className="sk-num" style={{display:'inline-block',width:72,height:12,borderRadius:4,background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)',backgroundSize:'200% 100%',animation:'sk-shimmer 1.4s infinite'}} /> : sub}</div>}
    </div>
  </div>
);

export function LeadStatCards({ stats, loading }) {
  return (
    <div className="stats-grid">
      <StatCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} label="Pending" value={stats.pending.length} sub={`${currency(stats.pendingAmount)} total`} color="#e67e22" loading={loading} />
      <StatCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>} label="Verified" value={stats.verified.length} sub={`${currency(stats.verifiedAmount)} total`} color="#16a34a" loading={loading} />
      <StatCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} label="Verified Today" value={stats.verifiedToday.length} sub={`${currency(stats.verifiedTodayAmount)} collected`} color="#3b82f6" loading={loading} />
      <StatCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} label="Total Amount" value={currency(stats.totalAmount)} sub={`Across ${stats.totalLeads} leads`} color="#5B6B4E" loading={loading} />
    </div>
  );
}

export default function Dashboard({ embedded, onStats, selectedLogId, onSelectLead }) {
  const [leads, setLeads] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [ngoFilter, setNgoFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingId, setViewingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const PAGE_SIZE = 20;
  const [leadPage, setLeadPage] = useState(1);

  const mountedRef = useRef(true);
  const clickRef = useRef(null);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const load = useCallback((silent) => {
    if (!silent) setLoading(true);
    apiGet('/accounts/leads')
      .then((all) => {
        if (mountedRef.current) {
          setAllLeads(all);
          setLeads(statusFilter ? all.filter(l => l.accounts_status === statusFilter) : all);
        }
      })
      .catch((err) => { console.error('API error:', err.message); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const rtTimerRef = useRef(null);
  const rtLoad = useCallback(() => {
    if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
    rtTimerRef.current = setTimeout(() => load(true), 250);
  }, [load]);
  useEffect(() => () => { if (rtTimerRef.current) clearTimeout(rtTimerRef.current); if (clickRef.current) clearTimeout(clickRef.current); }, []);

  useRealtime('fro_donor_logs', {
    filter: 'action=eq.disposition',
    onInsert: rtLoad,
    onUpdate: rtLoad,
  });

  const stats = useMemo(() => {
    const pending = allLeads.filter(l => l.accounts_status === 'pending');
    const verified = allLeads.filter(l => l.accounts_status === 'verified');
    const rejected = allLeads.filter(l => l.accounts_status === 'rejected');
    const pendingAmount = pending.reduce((s, l) => s + Number(l.amount || 0), 0);
    const verifiedAmount = verified.reduce((s, l) => s + Number(l.amount || 0), 0);
    const totalAmount = allLeads.reduce((s, l) => s + Number(l.amount || 0), 0);

    const today = new Date().toDateString();
    const verifiedToday = verified.filter(l => l.verified_at && new Date(l.verified_at).toDateString() === today);
    const verifiedTodayAmount = verifiedToday.reduce((s, l) => s + Number(l.amount || 0), 0);

    return { pending, verified, rejected, pendingAmount, verifiedAmount, totalAmount, verifiedToday, verifiedTodayAmount, totalLeads: allLeads.length };
  }, [allLeads]);

  const osRef = useRef(onStats);
  osRef.current = onStats;
  useEffect(() => { if (embedded && osRef.current) osRef.current({ stats, loading }); }, [stats, loading, embedded]);

  const filtered = useMemo(() => {
    let result = leads;
    if (ngoFilter) result = result.filter(l => l.donor_project === ngoFilter);
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(l =>
      (l.donor_name || '').toLowerCase().includes(q) ||
      (l.donor_mobile || '').includes(q) ||
      (l.agent_name || '').toLowerCase().includes(q)
    );
  }, [leads, searchQuery, ngoFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((leadPage - 1) * PAGE_SIZE, leadPage * PAGE_SIZE);

  useEffect(() => { setLeadPage(1); }, [searchQuery, ngoFilter, statusFilter]);
  useEffect(() => { if (leadPage > pageCount) setLeadPage(pageCount); }, [pageCount, leadPage]);

  const exportExcel = () => {
    const na = v => (v === undefined || v === null || String(v).trim() === '') ? 'NA' : v;
    const project = l => NGO_LABELS[l.donor_project] || l.donor_project || 'NA';
    const remark = l => l.accounts_status === 'rejected'
      ? `Rejected${l.rejection_reason ? ' · ' + l.rejection_reason : ''}`
      : l.claimed_receipt ? `Claimed · ${l.agent_name || 'Unknown'}` : (l.accounts_status || '');
    const rows = [LEAD_EXPORT_HEADERS, ...filtered.map(l => {
      const meta = receivedMeta(l.received_source);
      const mop = meta ? meta.mop : 'Bank';
      const recvBank = meta ? meta.receivedBank : na(l.donor_bank_name);
      return [
        'NA', na(l.transaction_date), na(l.agent_name), na(l.donor_name), na(l.donor_mobile),
        'NA', 'NA', 'NA', 'NA', na(l.donor_address),
        na(l.donor_address_2), 'NA', 'NA', na(l.donor_city), na(l.donor_pin_code), na(l.donor_pan),
        'NA', na(l.donor_email), 'NA', 'NA', na(l.donor_mobile),
        'NA', 'NA', 'NA', na(l.agent_name), na(l.agent_name),
        mop, recvBank, na(l.upi_transaction_id), 'NA', 'NA', na(l.donor_bank_name),
        l.amount ?? 'NA', na(l.receipt_no), 'NA', na(l.transaction_date),
        'NA', project(l), 'Corpus', remark(l), 'NA',
      ];
    })];
    if (filtered.length === 0) { alert('No leads to export'); return }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lead Verification');
    XLSX.writeFile(wb, `lead-verification_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const sendToReceipts = () => {    const verified = leads.filter(l => l.accounts_status === 'verified');
    if (verified.length === 0) return;

    const rows = verified.map(l => ({
      'Donor Name': l.donor_name || '',
      'Address 1': l.donor_address || '',
      'PAN No.': l.donor_pan || '',
      'Email ID': l.donor_email || '',
      'Mode of Payment (MOP)': l.payment_mode || '',
      'Payment ID No.': l.upi_transaction_id || '',
      'Donor Bank Name': l.donor_bank_name || '',
      'Amount': String(l.amount || 0),
      'Receipt No.': l.receipt_no || '',
      'Receipt Date': l.verified_at || l.transaction_date || '',
      'Account Of': 'Corpus',
      'Mobile No.': l.donor_mobile || '',
      'City': l.donor_city || '',
      'Project': l.donor_project || 'bsct',
    }));

    localStorage.setItem('receipts_verified_data', JSON.stringify(rows));
    localStorage.setItem('receipts_verified_count', String(verified.length));
    alert(`${verified.length} verified leads sent to Receipts page. Go to Receipts → Load from Saved.`);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await apiDelete('/accounts/leads/' + deleteConfirm.log_id);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await apiDelete('/accounts/leads');
      setDeleteAllConfirm(false);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div>
      {!embedded && <LeadStatCards stats={stats} loading={loading} />}

      <div className="card">
        <div className="filter-bar">
          <input
            className="search-input"
            placeholder="Search by donor, phone, or agent..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }}>
            <option value="pending">Pending ({allLeads.filter(l => l.accounts_status === 'pending').length})</option>
            <option value="verified">Verified ({allLeads.filter(l => l.accounts_status === 'verified').length})</option>
            <option value="rejected">Rejected ({allLeads.filter(l => l.accounts_status === 'rejected').length})</option>
            <option value="">All ({allLeads.length})</option>
          </select>
          <select value={ngoFilter} onChange={e => { setNgoFilter(e.target.value); }}>
            <option value="">All NGOs</option>
            <option value="bsct">Being Sevak</option>
            <option value="maan">Mann Care</option>
            <option value="aflf">Ashray</option>
          </select>
          {statusFilter === 'verified' && leads.length > 0 && (
            <button className="btn btn-sm" style={{ background:'#1d6f42', color:'#fff', whiteSpace:'nowrap', marginLeft:8 }} onClick={sendToReceipts}>
              {'\u27A1'} Send to Receipts ({leads.length})
            </button>
          )}
          {statusFilter === 'pending' && stats.pending.length > 0 && (
            <button className="btn btn-sm" style={{ background:'#dc2626', color:'#fff', whiteSpace:'nowrap', marginLeft:8 }} onClick={() => setDeleteAllConfirm(true)}>
              {'\u2715'} Delete All ({stats.pending.length})
            </button>
          )}
          <button className="btn btn-sm" style={{ background:'#16a34a', color:'#fff', whiteSpace:'nowrap', marginLeft:8, display:'inline-flex', alignItems:'center', gap:6 }} onClick={exportExcel}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export ({filtered.length})
          </button>
        </div>
        <div className="entry-scroll">
          <div className="entry-grid">
            {loading ? (
              Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)
            ) : pageItems.length === 0 ? (
              <div className="entry-card-empty">
                {searchQuery ? 'No leads match your search.' : 'No leads found.'}
              </div>
            ) : (
              pageItems.map(l => (
              <div key={l.log_id} className="entry-card"
                onClick={() => {
                  if (!onSelectLead) { setViewingId(l.log_id); return; }
                  if (clickRef.current) clearTimeout(clickRef.current);
                  clickRef.current = setTimeout(() => { clickRef.current = null; setViewingId(l.log_id); }, 240);
                }}
                onDoubleClick={() => {
                  if (!onSelectLead) return;
                  if (clickRef.current) { clearTimeout(clickRef.current); clickRef.current = null; }
                  if (l.accounts_status === 'pending') onSelectLead(l);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', opacity: l.accounts_status !== 'pending' ? 0.65 : 1, cursor: 'pointer', boxShadow: selectedLogId === l.log_id ? '0 0 0 2px var(--sage)' : undefined, ...(selectedLogId === l.log_id ? { background: 'var(--bg)' } : {}) }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#5B6B4E18', color: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {(l.donor_name || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 600, color: '#111827', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.donor_name}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{l.donor_mobile || '\u2014'}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sage)', whiteSpace: 'nowrap' }}>{currency(l.amount)}</div>
                {l.accounts_status === 'pending' ? <span className="pill pill-yellow" style={{ fontSize: 9 }}>Pending</span> :
                 l.accounts_status === 'verified' ? <span className="pill pill-green" style={{ fontSize: 9 }}>Verified</span> :
                 l.accounts_status === 'rejected' ? <span className="pill pill-red" style={{ fontSize: 9 }} title={l.rejection_reason || ''}>Rejected</span> :
                 <span className="pill pill-gray" style={{ fontSize: 9 }}>{l.accounts_status || '\u2014'}</span>}
                 <span className="pill pill-gray" style={{ fontSize: 10 }}>{({ bsct: 'Being Sevak', maan: 'Mann Care', aflf: 'Ashray' })[l.donor_project] || l.donor_project || '\u2014'}</span>
                {selectedLogId === l.log_id && <span className="pill" style={{ fontSize: 9, background: '#5B6B4E', color: '#fff' }}>Selected</span>}
                {l.claimed_receipt && <span className="pill" style={{ fontSize: 9, background: '#FDE7DB', color: '#B5603A' }}>Claimant · {l.agent_name || 'Unknown'}</span>}
                <span className="pill pill-gray" style={{ fontSize: 9 }}>{l.agent_name || 'No agent'}</span>
                <span style={{ fontSize: 10, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4c9d0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
              </div>
            ))
          )}
          </div>
        </div>
        <Pagination page={leadPage} setPage={setLeadPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Delete Lead</h3></div>
            <div className="modal-body" style={{ padding: 20 }}>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}>Delete this pending lead entry?</p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
                <strong>{deleteConfirm.donor_name}</strong> ({currency(deleteConfirm.amount)}) will be removed and the assignment returned to the agent for rework. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="btn btn-sm" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</button>
                <button className="btn btn-sm" onClick={handleDelete} disabled={deleting} style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteAllConfirm && (
        <div className="modal-overlay" onClick={() => !deletingAll && setDeleteAllConfirm(false)}>
          <div className="modal" style={{ maxWidth: 440, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Delete All Pending Leads</h3></div>
            <div className="modal-body" style={{ padding: 20 }}>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}>Delete all {stats.pending.length} pending lead entries?</p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
                Every pending entry ({currency(stats.pendingAmount)} total) will be removed and the assignments returned to their agents for rework. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="btn btn-sm" onClick={() => setDeleteAllConfirm(false)} disabled={deletingAll}>Cancel</button>
                <button className="btn btn-sm" onClick={handleDeleteAll} disabled={deletingAll} style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
                  {deletingAll ? 'Deleting...' : `Delete All (${stats.pending.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RightPanel open={!!viewingId} onClose={() => { setViewingId(null); load(); }} title="Lead Details">
        {viewingId && <LeadDetail logId={viewingId} onBack={() => { setViewingId(null); load(); }} variant="drawer" onDelete={() => { const l = filtered.find(x => x.log_id === viewingId); if (l) { setViewingId(null); setDeleteConfirm(l); } }} />}
      </RightPanel>

    </div>
  );
}
