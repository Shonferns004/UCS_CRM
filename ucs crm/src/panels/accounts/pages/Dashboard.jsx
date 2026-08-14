import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Send, Trash2, Download, FileText, RefreshCw } from 'lucide-react';
import { apiGet, apiDelete } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';
import LeadDetail from './LeadDetail';
import RightPanel from '../components/RightPanel';
import Pagination from '../components/Pagination';
import * as XLSX from 'xlsx';
import { receivedMeta } from '../services/receivedSource';

const currency = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const fmtDT = d => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const h = dt.getHours(), m = dt.getMinutes();
  return `${day}-${mon}-${dt.getFullYear()} \u00B7 ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const LEAD_EXPORT_HEADERS = ['Branch','Transaction Date','Caller Name','Donor Name','Mobile No.','Len','Count','Mobil No. 2 / Tel','Len','Address 1','Address-2','Station','East / West','City','Pin Code','Pan. No.','Len','Mail Id','Birth Date','Data Category','Mobile','Station','Android No','Team','Agent Name','FSE Name','MOP','Received Bank','Payment Id No.','Len','Count','Donors Bank Name','Amount','Receipt No','Receipt Book No','Transaction Date','Time','Project Supported','Account of','Remark-1','Branch'];

const SkeletonNum = () => (
  <span className="sk-num" style={{ display:'inline-block',width:48,height:24,borderRadius:6,background:'linear-gradient(90deg,var(--bg) 25%,var(--line) 50%,var(--bg) 75%)',backgroundSize:'200% 100%',animation:'sk-shimmer 1.4s infinite'}} />
);

const IconBtn = ({ on, ch, dis, title, bg = '#fff', fg = 'var(--sage)', style }) => (
  <button className="btn btn-sm fb-btn" onClick={on} disabled={dis} title={title} aria-label={title} style={{ background: bg, color: fg, border: 'none', opacity: dis ? .5 : 1, ...style }}>{ch}</button>
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

export default function Dashboard({ embedded, onStats, selectedLogId, onSelectLead, globalNgo, onView, amountFilter = '', listRef, onListScroll, onAmounts }) {
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
  const PAGE_SIZE = 30;
  const [leadPage, setLeadPage] = useState(1);

  const ngoActive = globalNgo !== undefined ? globalNgo : ngoFilter;

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
  useEffect(() => { onAmounts?.(allLeads.map(l => Number(l.amount)).filter(Number.isFinite)); }, [allLeads, onAmounts]);

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
    if (ngoActive) result = result.filter(l => l.donor_project === ngoActive);
    if (amountFilter !== '' && amountFilter != null) result = result.filter(l => Number(l.amount) === Number(amountFilter));
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(l =>
      (l.donor_name || '').toLowerCase().includes(q) ||
      (l.donor_mobile || '').includes(q) ||
      (l.agent_name || '').toLowerCase().includes(q) ||
      String(l.amount || '').toLowerCase().includes(q)
    );
  }, [leads, searchQuery, ngoActive, amountFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((leadPage - 1) * PAGE_SIZE, leadPage * PAGE_SIZE);

  useEffect(() => { setLeadPage(1); }, [searchQuery, ngoActive, statusFilter, amountFilter]);
  useEffect(() => { if (leadPage > pageCount) setLeadPage(pageCount); }, [pageCount, leadPage]);

  const exportExcel = () => {
    const na = v => (v === undefined || v === null || String(v).trim() === '') ? 'NA' : v;
    const remark = l => l.accounts_status === 'rejected'
      ? `Rejected${l.rejection_reason ? ' · ' + l.rejection_reason : ''}`
      : l.claimed_receipt ? `Claimed · ${l.agent_name || 'Unknown'}` : (l.accounts_status || '');
    const rows = [LEAD_EXPORT_HEADERS, ...filtered.map(l => {
      const meta = receivedMeta(l.received_source);
      const mop = meta ? na(meta.mop) : 'Bank';
      const recvBank = meta ? na(meta.receivedBank) : na(l.donor_bank_name);
      return [
        'NA', na(l.transaction_datetime || l.verified_at), na(l.agent_name), na(l.donor_name), na(l.donor_mobile),
        'NA', 'NA', 'NA', 'NA', na(l.donor_address),
        na(l.donor_address_2), 'NA', 'NA', na(l.donor_city), na(l.donor_pin_code), na(l.donor_pan),
        'NA', na(l.donor_email), 'NA', 'NA', 'NA',
        'NA', 'NA', 'NA', na(l.agent_name), na(l.agent_name),
        mop, recvBank, na(l.upi_transaction_id), 'NA', 'NA', na(l.donor_bank_name),
        l.amount ?? 'NA', na(l.receipt_no), 'NA', na(l.transaction_datetime || l.verified_at),
        'NA', 'NA', 'Corpus', na(remark(l)), 'NA',
      ];
    })];
    if (filtered.length === 0) { alert('No leads to export'); return }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Write real date cells with a fixed display format (d/mm/yyyy = "1/08/2026") so Excel
    // never auto-converts the transaction date into a locale format like "1-Aug-26".
    const DATE_COLS = [1, 35];
    for (let r = 1; r < rows.length; r++) {
      for (const c of DATE_COLS) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        const m = String(cell.v == null ? '' : cell.v).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) continue;
        ws[addr] = { t: 'n', v: Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569, z: 'd/mm/yyyy' };
      }
    }
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
      'Receipt Date': l.verified_at || l.transaction_datetime || '',
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
            placeholder="Search donor / phone / agent / amount..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', width: 200, minWidth: 0 }}
          />
          {embedded ? (
            <span style={{ display:'inline-flex', alignItems:'center', gap:6, minHeight:32, padding:'0 11px', borderRadius:999, background:'#fff3cd', color:'#a16207', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }} title="Showing pending leads">
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#eab308' }} />
              Pending {allLeads.filter(l => l.accounts_status === 'pending').length}
            </span>
          ) : (
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}>
              <option value="pending">Pending ({allLeads.filter(l => l.accounts_status === 'pending').length})</option>
              <option value="verified">Verified ({allLeads.filter(l => l.accounts_status === 'verified').length})</option>
              <option value="rejected">Rejected ({allLeads.filter(l => l.accounts_status === 'rejected').length})</option>
              <option value="">All ({allLeads.length})</option>
            </select>
          )}
          {globalNgo === undefined && (
            <select value={ngoFilter} onChange={e => { setNgoFilter(e.target.value); }} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}>
              <option value="">All NGOs</option>
              <option value="bsct">Being Sevak</option>
              <option value="mann">Mann Care</option>
              <option value="aflf">Ashray</option>
            </select>
          )}
          <IconBtn on={rtLoad} ch={<RefreshCw size={14} strokeWidth={2.5} />} title="Refresh" />
          {statusFilter === 'verified' && leads.length > 0 && (
            <IconBtn on={sendToReceipts} ch={<><Send size={14} strokeWidth={2.5} /><span className="fb-count">{leads.length}</span></>} title={`Send to Receipts (${leads.length})`} bg="#1d6f42" fg="#fff" />
          )}
          {statusFilter === 'pending' && stats.pending.length > 0 && (
            <IconBtn on={() => setDeleteAllConfirm(true)} ch={<><Trash2 size={14} strokeWidth={2.5} /><span className="fb-count">{stats.pending.length}</span></>} title={`Delete all pending (${stats.pending.length})`} bg="#dc2626" fg="#fff" />
          )}
          <IconBtn on={exportExcel} ch={<><Download size={14} strokeWidth={2.5} />{filtered.length > 0 && <span className="fb-count">{filtered.length}</span>}</>} title={`Export ${filtered.length} leads`} bg="#16a34a" fg="#fff" />
        </div>
        <div className="entry-scroll" ref={listRef} onScroll={onListScroll}>
          <div className="entry-grid">
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="entry-card">
                  <div className="ec-main">
                    <div className="ec-primary">
                      <div className="sk" style={{ width: '45%', height: 13, borderRadius: 4 }} />
                      <div className="sk" style={{ width: '60%', height: 10, borderRadius: 4, marginTop: 6 }} />
                    </div>
                    <div className="sk" style={{ width: 64, height: 18, borderRadius: 5 }} />
                  </div>
                  <div className="ec-meta">
                    <div className="sk" style={{ width: 60, height: 16, borderRadius: 8 }} />
                    <div className="sk" style={{ width: 90, height: 10, borderRadius: 4 }} />
                  </div>
                </div>
              ))
            ) : pageItems.length === 0 ? (
              <div className="entry-card-empty">
                {searchQuery ? 'No leads match your search.' : 'No leads found.'}
              </div>
            ) : (
              pageItems.map(l => (
              <div key={l.log_id} className={'entry-card' + (selectedLogId === l.log_id ? ' is-selected' : '') + (l.accounts_status !== 'pending' ? ' is-dim' : '') + (l.bank_match ? (l.bank_match.match_source === 'manual' ? ' is-match-manual' : ' is-match-auto') : ' is-match-unmatched')}
                onClick={() => {
                  if (!onSelectLead) { setViewingId(l.log_id); onView?.(l.log_id); return; }
                  if (clickRef.current) clearTimeout(clickRef.current);
                  clickRef.current = setTimeout(() => {
                    clickRef.current = null;
                    if (selectedLogId === l.log_id) {
                      onSelectLead(null);
                    } else {
                      setViewingId(l.log_id);
                      onView?.(l.log_id);
                    }
                  }, 300);
                }}
                onDoubleClick={() => {
                  if (!onSelectLead) return;
                  if (clickRef.current) { clearTimeout(clickRef.current); clickRef.current = null; }
                  if (l.accounts_status === 'pending') {
                    if (selectedLogId === l.log_id) onSelectLead(null);
                    else onSelectLead(l);
                  }
                }}>
                <div className="ec-main">
                  <div className="ec-primary">
                    <div className="ec-title">{l.donor_name}</div>
                    <div className="ec-sub">{l.donor_mobile || '\u2014'}</div>
                    {l.audit_name && String(l.audit_name).trim().toLowerCase() !== String(l.donor_name || '').trim().toLowerCase() && (
                      <div className="ec-sub" style={{ fontSize: 10, color: 'var(--ink-soft)', opacity: .8 }}>as per bank: {l.audit_name}</div>
                    )}
                  </div>
                  <div className="ec-amount">{currency(l.amount)}</div>
                  <svg className="ec-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
                <div className="ec-meta">
                  {l.accounts_status === 'pending' ? <span className="pill pill-yellow">Pending</span> :
                   l.accounts_status === 'verified' ? <span className="pill pill-green">Verified</span> :
                   l.accounts_status === 'rejected' ? <span className="pill pill-red" title={l.rejection_reason || ''}>Rejected</span> :
                   <span className="pill pill-gray">{l.accounts_status || '\u2014'}</span>}
                  <span className="pill pill-gray">{({ bsct: 'Being Sevak', mann: 'Mann Care', aflf: 'Ashray' })[l.donor_project] || l.donor_project || '\u2014'}</span>
                  {l.upi_transaction_id && <span className="pill pill-gray" style={{ fontFamily: 'monospace' }} title="Incoming payment ID">{l.upi_transaction_id}</span>}
                  {l.claimed_receipt && <span className="pill" style={{ fontSize: 10, background: '#FDE7DB', color: '#B5603A' }}>Claimant</span>}
                  {l.bank_match && <span className="pill" style={{ fontSize: 10, background: l.bank_match.match_source === 'manual' ? '#fef3c7' : '#dbeafe', color: l.bank_match.match_source === 'manual' ? '#92400e' : '#1d4ed8' }} title={`${l.bank_match.match_source === 'manual' ? 'Manually' : 'Auto'} matched${l.bank_match.match_score ? ` · score ${l.bank_match.match_score}` : ''}`}>
                    {l.bank_match.match_status === 'confirmed' ? 'Confirmed' : l.bank_match.match_source === 'manual' ? 'Manual Match' : 'Auto Match'}{l.bank_match.match_no ? ` · ${l.bank_match.match_no}` : ''}
                  </span>}
                  <span className="ec-agent">{l.agent_name || 'No agent'}</span>
                  <span className="ec-date">{fmtDT(l.transaction_datetime || l.created_at)}</span>
                </div>
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

      <RightPanel open={!!viewingId} onClose={() => { setViewingId(null); load(); onView?.(null); }} title="Lead Details" icon={<FileText size={19} strokeWidth={2} />}>
        {viewingId && <LeadDetail logId={viewingId} onBack={() => { setViewingId(null); load(); onView?.(null); }} variant="drawer" onDelete={() => { const l = filtered.find(x => x.log_id === viewingId); if (l) { setViewingId(null); setDeleteConfirm(l); onView?.(null); } }} />}
      </RightPanel>

    </div>
  );
}
