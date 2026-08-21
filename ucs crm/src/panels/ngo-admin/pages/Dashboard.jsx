import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { apiGet, apiPut } from '../api/auth';
import { SkeletonDashboard } from '../../../components/Skeleton';
import RecentNotices from '../../../components/RecentNotices';

const DISPOSITION_LABELS = {
  pending: 'Pending', contacted: 'Contacted', follow_up: 'Follow Up', scheduled: 'Scheduled',
  busy: 'Busy', ringing: 'Ringing', call_waiting: 'Call Waiting', unreachable: 'Unreachable',
  switched_off: 'Switched Off', out_of_coverage: 'Out of Coverage', wrong_number: 'Wrong Number',
  invalid_number: 'Invalid', rejected: 'Rejected', temporary_network_issue: 'Temporary Network Issue', voicemail: 'Voicemail',
  lead_done: 'Lead Done', done: 'Done', visit_donate: 'Visit & Donate', will_donate_online: 'Will Donate Online',
  promise_to_pay: 'Promise to Pay', payment_pending: 'Payment Pending', already_donated: 'Already Donated',
  email_sent: 'Email Sent', whatsapp_sent: 'WhatsApp Sent', csr_inquiry: 'CSR Inquiry',
  wants_80g_details: 'Wants 80G Details', wants_trust_documents: 'Wants Trust Documents',
  not_interested: 'Not Interested', not_interested_now: 'Not Interested Now', dnd: 'DND',
  wrong_person: 'Wrong Person', call_disconnected: 'Call Disconnected',
  language_barrier: 'Language Barrier', transferred_senior: 'Transferred to Senior',
  query_complaint: 'Query/Complaint', receipt_request: 'Receipt Request',
  donation_collected: 'Lead Done',
};

const DISPOSITION_GROUPS = [
  { label: 'Converted', color: '#16a34a', bg: '#f0fdf4', statuses: ['donation_collected', 'promise_to_pay', 'lead_done', 'done', 'visit_donate', 'will_donate_online', 'payment_pending', 'already_donated'] },
  { label: 'In Progress', color: '#d97706', bg: '#fffbeb', statuses: ['pending', 'contacted', 'follow_up', 'scheduled', 'email_sent', 'whatsapp_sent', 'csr_inquiry', 'wants_80g_details', 'wants_trust_documents'] },
  { label: 'Negative', color: '#dc2626', bg: '#fef2f2', statuses: ['not_interested', 'not_interested_now', 'dnd', 'wrong_person', 'call_disconnected', 'rejected', 'busy', 'ringing', 'call_waiting', 'unreachable', 'switched_off', 'out_of_coverage', 'wrong_number', 'invalid_number', 'temporary_network_issue', 'voicemail', 'language_barrier'] },
  { label: 'Other', color: '#5B6B4E', bg: '#f0f2ee', statuses: ['transferred_senior', 'query_complaint', 'receipt_request'] },
];

const PER_PAGE = 50;

function StationDetailModal({ station, stats, stationInfo, onClose }) {
  const [donors, setDonors] = useState([]);
  const [loadingDonors, setLoadingDonors] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!station) return null;
  const total = Object.values(stats || {}).reduce((t, v) => t + v, 0);
  const groupData = DISPOSITION_GROUPS.map(g => ({
    ...g, total: g.statuses.reduce((t, s) => t + (stats?.[s] || 0), 0),
  })).filter(g => g.total > 0);
  const allStatuses = DISPOSITION_GROUPS.flatMap(g =>
    g.statuses.filter(s => (stats?.[s] || 0) > 0).map(s => ({ status: s, count: stats[s], group: g }))
  );

  const donorsRef = useRef(null);
  const fetchDonors = useCallback(async (status) => {
    if (donorsRef.current) donorsRef.current.abort();
    const controller = new AbortController();
    donorsRef.current = controller;
    setLoadingDonors(true);
    setStatusFilter(status || '');
    try {
      const params = new URLSearchParams({ station });
      if (status) params.set('status', status);
      const data = await apiGet(`/ngo-admin/donors-by-station?${params}`, { signal: controller.signal, timeout: 30000 });
      if (!controller.signal.aborted) {
        setDonors(data || []);
        setPage(1);
      }
    } catch {
      if (!controller.signal.aborted) setDonors([]);
    } finally {
      if (!controller.signal.aborted) setLoadingDonors(false);
    }
  }, [station]);

  const filtered = useMemo(() => {
    if (!search) return donors;
    const q = search.toLowerCase();
    return donors.filter(d =>
      (d.donor_name && d.donor_name.toLowerCase().includes(q)) ||
      (d.donor_mobile && d.donor_mobile.includes(q)) ||
      (d.donor_city && d.donor_city.toLowerCase().includes(q)) ||
      (d.fro_name && d.fro_name.toLowerCase().includes(q))
    );
  }, [donors, search]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  useEffect(() => { setPage(1); }, [search]);

  const handleStatusClick = (status) => {
    if (statusFilter === status) {
      setStatusFilter('');
      setDonors([]);
    } else {
      fetchDonors(status);
    }
  };

  const handleClear = () => {
    setDonors([]);
    setStatusFilter('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{station}</h3>
            {stationInfo?.fro_worker_name && (
              <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, background: 'var(--bg)', padding: '2px 10px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {stationInfo.fro_worker_name}
              </span>
            )}
            <span style={{ fontSize: 12, background: 'var(--sage)', color: '#fff', padding: '2px 10px', borderRadius: 12, fontWeight: 600 }}>
              {total} donors
            </span>
            {stationInfo?.ngos?.map(n => (
              <span key={n.ngo_id || n.ngo_name} style={{ fontSize: 11, background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: 12 }}>
                {n.ngo_name}
              </span>
            ))}
          </div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {groupData.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 8, borderRadius: 4, background: '#e5e7eb', display: 'flex', overflow: 'hidden' }}>
                {groupData.map(g => (
                  <div key={g.label} style={{ width: `${(g.total / total) * 100}%`, height: '100%', background: g.color, opacity: 0.6 }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                {groupData.map(g => (
                  <span key={g.label} style={{ fontSize: 11, fontWeight: 600, color: g.color, background: g.bg, padding: '2px 10px', borderRadius: 10 }}>
                    {g.label}: {g.total}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Disposition Breakdown
            {statusFilter && (
              <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                — click a status to view donors
              </span>
            )}
          </div>

          {allStatuses.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
              {allStatuses.map(({ status, count, group }) => (
                <button key={status} onClick={() => handleStatusClick(status)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 20, border: `1px solid ${statusFilter === status ? group.color : 'transparent'}`,
                    background: statusFilter === status ? group.bg : 'var(--bg)',
                    cursor: 'pointer', fontSize: 12, fontWeight: statusFilter === status ? 700 : 500,
                    color: statusFilter === status ? group.color : 'var(--ink-soft)',
                    transition: 'all .15s',
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                  {DISPOSITION_LABELS[status] || status}
                  <span style={{ fontWeight: 700, color: group.color, marginLeft: 2 }}>{count}</span>
                </button>
              ))}
            </div>
          )}

          {!statusFilter && !donors.length && (
            <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
              Click a disposition above to view donor list for that status.
            </div>
          )}

          {(statusFilter || donors.length > 0) && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 4 }}>
              <div className="filter-bar" style={{ marginBottom: 12 }}>
                <input placeholder="Search name, phone, city..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 240 }} />
                {statusFilter && (
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#f0f2ee', color: 'var(--ink-soft)', fontWeight: 500 }}>
                    {DISPOSITION_LABELS[statusFilter] || statusFilter}
                  </span>
                )}
                <span className="count">{loadingDonors ? 'Loading...' : `${filtered.length} donors`}</span>
                {donors.length > 0 && (
                  <button className="btn btn-sm btn-outline" onClick={handleClear}>Clear</button>
                )}
              </div>

              {loadingDonors ? (
                <div className="loading" style={{ padding: 20 }}>Loading donors...</div>
              ) : paginated.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>City</th>
                        <th>FRO</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.donor_name || '—'}</td>
                          <td>{d.donor_mobile || '—'}</td>
                          <td>{d.donor_city || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{d.fro_name || 'Unassigned'}</td>
                          <td><span className="pill" style={{
                            background: (() => { const g = DISPOSITION_GROUPS.find(gr => gr.statuses.includes(d.status)); return g ? g.bg : '#f3f4f6'; })(),
                            color: (() => { const g = DISPOSITION_GROUPS.find(gr => gr.statuses.includes(d.status)); return g ? g.color : '#6b7280'; })(),
                          }}>{DISPOSITION_LABELS[d.status] || d.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
                  No donors match this filter.
                </div>
              )}

              {totalPages > 1 && !loadingDonors && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0 4px' }}>
                  <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p)} style={{ minWidth: 32 }}>
                      {p}
                    </button>
                  ))}
                  <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CollectionDetailModal({ period: defaultPeriod, totalAmount, onClose, status, monthAmount, monthCount, todayAmount, todayCount }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState(defaultPeriod || 'month');

  const isVerification = status === 'verified' || status === 'unverified';
  const label = status === 'verified' ? 'Verified' : status === 'unverified' ? 'Unverified' : 'Collection';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const url = isVerification
      ? `/ngo-admin/verification?status=${status}&period=${period}`
      : `/ngo-admin/collections/fro-wise?period=${period}`;
    apiGet(url, { signal: controller.signal, timeout: 30000 })
      .then(data => { if (!controller.signal.aborted) setRows(Array.isArray(data) ? data : []); })
      .catch(() => { if (!controller.signal.aborted) setRows([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, status, isVerification]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => (r.fro_name || '').toLowerCase().includes(q));
  }, [rows, search]);

  const isMonth = period === 'month';
  const now = new Date();
  const dateTitle = isMonth
    ? now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : `Today – ${now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const title = isVerification ? `${label} Collections — ${dateTitle}` : dateTitle;

  const displayAmount = isVerification
    ? (period === 'month' ? (monthAmount || 0) : (todayAmount || 0))
    : rows.reduce((s, r) => s + (r.collection_amount || 0), 0);
  const totalLeads = rows.reduce((s, r) => s + (r.count || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>
              {rows.length} FRO{rows.length !== 1 ? 's' : ''}
            </span>
            <button className="btn btn-sm btn-outline" onClick={onClose} style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>
        <div className="modal-body" style={{ padding: '14px 18px' }}>
          {loading ? (
            <div className="loading" style={{ padding: 20 }}>Loading...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
              No {label.toLowerCase()} collection data available.
            </div>
          ) : (
            <>
              {isVerification && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <button onClick={() => setPeriod('month')} style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: period === 'month' ? '1.5px solid var(--sage)' : '1px solid var(--line)',
                    background: period === 'month' ? '#f0fdf4' : 'transparent',
                    color: period === 'month' ? 'var(--sage)' : 'var(--ink-soft)',
                  }}>Month</button>
                  <button onClick={() => setPeriod('today')} style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: period === 'today' ? '1.5px solid #f59e0b' : '1px solid var(--line)',
                    background: period === 'today' ? '#fffbeb' : 'transparent',
                    color: period === 'today' ? '#b45309' : 'var(--ink-soft)',
                  }}>Today</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Search FRO name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    flex: 1, padding: '7px 10px', border: '1px solid var(--line)',
                    borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none',
                    background: 'var(--bg)', color: 'var(--ink)',
                  }}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="btn btn-sm btn-outline">Clear</button>
                )}
              </div>
              {search && (
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8 }}>
                  Showing {filtered.length} of {rows.length} FRO{rows.length !== 1 ? 's' : ''}
                </div>
              )}

              <div style={{ overflowX: 'auto', maxHeight: '50vh', overflowY: 'auto', borderRadius: 6, border: '1px solid var(--line)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)', padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--line)' }}>
                        FRO Name
                      </th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)', padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--line)' }}>
                        {isVerification ? 'Amount (₹)' : 'Collection (₹)'}
                      </th>
                      {isVerification && (
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)', padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--line)' }}>
                          Leads
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const val = isVerification ? r.amount : r.collection_amount;
                      return (
                        <tr key={r.fro_id} style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.fro_name}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: val > 0 ? 'var(--sage)' : '#9ca3af' }}>
                            ₹{Number(val).toLocaleString('en-IN')}
                            {!isVerification && r.is_achieved && (
                              <span style={{ fontSize: 9, color: '#8b5cf6', fontWeight: 500, marginLeft: 4, verticalAlign: 'middle' }}>(set)</span>
                            )}
                          </td>
                          {isVerification && (
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--ink-soft)' }}>
                              {r.count || 0}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={isVerification ? 3 : 2} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>
                          No FROs match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ padding: '10px', fontWeight: 700, borderTop: '2px solid var(--line)', fontSize: 13 }}>Total</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, borderTop: '2px solid var(--line)', color: 'var(--sage)', fontSize: 13 }}>
                        ₹{displayAmount.toLocaleString('en-IN')}
                      </td>
                      {isVerification && (
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, borderTop: '2px solid var(--line)', color: 'var(--ink-soft)', fontSize: 13 }}>
                          {totalLeads}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FroDetailModal({ froId, froName, filterType, perfPeriod, onClose }) {
  const [allDonors, setAllDonors] = useState([]);
  const [loadingDonors, setLoadingDonors] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (!froId) return;
    setLoadingDonors(true);
    apiGet(`/ngo-admin/donors-by-fro?fro_worker_id=${froId}&period=${perfPeriod || 'today'}`)
      .then(data => setAllDonors(data || []))
      .catch(() => setAllDonors([]))
      .finally(() => setLoadingDonors(false));
  }, [froId, perfPeriod]);

  const isNonConnected = filterType === 'non_connected';
  const filterColor = isNonConnected ? '#dc2626' : '#16a34a';
  const filterBg = isNonConnected ? '#fef2f2' : '#f0fdf4';
  const filterLabel = isNonConnected ? 'Non-Connected' : 'Connected';

  const hasPeriodData = perfPeriod && perfPeriod !== 'all';

  const baseList = useMemo(() => {
    const getKey = (d) => hasPeriodData && d.call_status ? d.call_status : d.status;
    if (isNonConnected) {
      return allDonors.filter(d => {
        const grp = DISPOSITION_GROUPS.find(g => g.statuses.includes(getKey(d)));
        return !grp || grp.label === 'Negative' || grp.label === 'Other';
      });
    }
    return allDonors.filter(d => {
      const grp = DISPOSITION_GROUPS.find(g => g.statuses.includes(getKey(d)));
      return grp && (grp.label === 'Converted' || grp.label === 'In Progress');
    });
  }, [allDonors, isNonConnected, hasPeriodData]);

  const total = baseList.length;

  const statusCounts = useMemo(() => {
    const counts = {};
    for (const d of baseList) {
      const key = hasPeriodData && d.call_status ? d.call_status : d.status;
      if (!counts[key]) counts[key] = 0;
      counts[key]++;
    }
    const result = [];
    for (const g of DISPOSITION_GROUPS) {
      for (const s of g.statuses) {
        if (counts[s] > 0) result.push({ status: s, count: counts[s], group: g });
      }
    }
    return result;
  }, [baseList, hasPeriodData]);

  const groupData = useMemo(() => {
    const grouped = {};
    for (const { group, count } of statusCounts) {
      if (!grouped[group.label]) grouped[group.label] = { label: group.label, color: group.color, bg: group.bg, total: 0 };
      grouped[group.label].total += count;
    }
    return Object.values(grouped).filter(g => g.total > 0);
  }, [statusCounts]);

  const donorsRef = useRef(null);
  const fetchDonors = useCallback(async (status) => {
    if (donorsRef.current) donorsRef.current.abort();
    const controller = new AbortController();
    donorsRef.current = controller;
    setStatusFilter(status || '');
    setPage(1);
    try {
      const params = new URLSearchParams({ fro_worker_id: froId });
      if (status) params.set('status', status);
      const data = await apiGet(`/ngo-admin/donors-by-fro?${params}`, { signal: controller.signal, timeout: 30000 });
      if (!controller.signal.aborted) setAllDonors(data || []);
    } catch {
      if (!controller.signal.aborted) setAllDonors([]);
    }
  }, [froId]);

  const filtered = useMemo(() => {
    let list = baseList;
    if (statusFilter) {
      list = list.filter(d => {
        const key = hasPeriodData && d.call_status ? d.call_status : d.status;
        return key === statusFilter;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.donor_name && d.donor_name.toLowerCase().includes(q)) ||
        (d.donor_mobile && d.donor_mobile.includes(q)) ||
        (d.station && d.station.toLowerCase().includes(q))
      );
    }
    return list;
  }, [baseList, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const handleStatusClick = (status) => {
    setStatusFilter(prev => prev === status ? '' : status);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{froName}</h3>
            <span style={{ fontSize: 12, fontWeight: 600, color: filterColor, background: filterBg, padding: '2px 10px', borderRadius: 12 }}>
              {total} {filterLabel}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>of {allDonors.length} total</span>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {loadingDonors ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>Loading donors...</div>
          ) : total === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>No {filterLabel.toLowerCase()} donors found</div>
          ) : (
            <>
              {groupData.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ height: 8, borderRadius: 4, background: '#e5e7eb', display: 'flex', overflow: 'hidden' }}>
                    {groupData.map(g => (
                      <div key={g.label} style={{ width: `${(g.total / total) * 100}%`, height: '100%', background: g.color, opacity: 0.6 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                    {groupData.map(g => (
                      <span key={g.label} style={{ fontSize: 11, fontWeight: 600, color: g.color, background: g.bg, padding: '2px 10px', borderRadius: 10 }}>
                        {g.label}: {g.total}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Disposition Breakdown
                <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  — click a status to view donors
                </span>
              </div>

              {statusCounts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
                  {statusCounts.map(({ status, count, group }) => (
                    <button key={status} onClick={() => handleStatusClick(status)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 20, border: `1px solid ${statusFilter === status ? group.color : 'transparent'}`,
                        background: statusFilter === status ? group.bg : 'var(--bg)',
                        cursor: 'pointer', fontSize: 12, fontWeight: statusFilter === status ? 700 : 500,
                        color: statusFilter === status ? group.color : 'var(--ink-soft)',
                        transition: 'all .15s',
                      }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                      {DISPOSITION_LABELS[status] || status}
                      <span style={{ fontWeight: 700, color: group.color, marginLeft: 2 }}>{count}</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 4 }}>
                <div className="filter-bar" style={{ marginBottom: 12 }}>
                  <input placeholder="Search name, phone, station..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 240 }} />
                  {statusFilter && (
                    <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#f0f2ee', color: 'var(--ink-soft)', fontWeight: 500 }}>
                      {DISPOSITION_LABELS[statusFilter] || statusFilter}
                    </span>
                  )}
                  <span className="count">{loadingDonors ? 'Loading...' : `${filtered.length} donors`}</span>
                  {statusFilter && (
                    <button className="btn btn-sm btn-outline" onClick={() => { setStatusFilter(''); setSearch(''); setPage(1); }}>Clear</button>
                  )}
                </div>

                {paginated.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>Station</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((d, i) => {
                          const displayStatus = hasPeriodData && d.call_status ? d.call_status : d.status;
                          const grp = DISPOSITION_GROUPS.find(gr => gr.statuses.includes(displayStatus));
                          return (
                            <tr key={d.id || d.donor_id}>
                              <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{(page - 1) * PER_PAGE + i + 1}</td>
                              <td style={{ fontWeight: 500 }}>{d.donor_name || '—'}</td>
                              <td>{d.donor_mobile || '—'}</td>
                              <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{d.station || '—'}</td>
                              <td><span className="pill" style={{
                                background: grp ? grp.bg : '#f3f4f6',
                                color: grp ? grp.color : '#6b7280',
                              }}>{DISPOSITION_LABELS[displayStatus] || displayStatus}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
                    No donors match this filter.
                  </div>
                )}

                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0 4px' }}>
                    <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                      Previous
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                      return (
                        <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p)} style={{ minWidth: 32 }}>
                          {p}
                        </button>
                      );
                    })}
                    <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [stationStats, setStationStats] = useState(null);
  const [stationsData, setStationsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedNgoId, setSelectedNgoId] = useState('all');
  const [accessibleNgos, setAccessibleNgos] = useState([]);
  const [weakPeriod, setWeakPeriod] = useState('today');
  const [weakPerformers, setWeakPerformers] = useState([]);
  const [weakLoading, setWeakLoading] = useState(false);
  const [showAllLowPerformers, setShowAllLowPerformers] = useState(false);
  const [perfPeriod, setPerfPeriod] = useState('today');
  const [froSearch, setFroSearch] = useState('');
  const [selectedFro, setSelectedFro] = useState(null);
  const [callAnalytics, setCallAnalytics] = useState(null);
  const todayStr = new Date().toISOString().slice(0,10);
  const monthStart = new Date().toISOString().slice(0,7) + '-01';
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0,10);

  useEffect(() => {
    let cancelled = false;
    apiGet('/ngo-admin/ngos').then(data => { if (!cancelled) setAccessibleNgos(data); }).catch((err) => { console.error('API error:', err.message); });
    return () => { cancelled = true };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setWeakLoading(true);
    const ngoParam = selectedNgoId !== 'all' ? `&ngo_id=${selectedNgoId}` : '';
    apiGet(`/ngo-admin/fro-performance?period=${weakPeriod}${ngoParam}`)
      .then(data => { if (!cancelled) setWeakPerformers(data); })
      .catch(() => { if (!cancelled) setWeakPerformers([]); })
      .finally(() => { if (!cancelled) setWeakLoading(false); });
    return () => { cancelled = true };
  }, [selectedNgoId, weakPeriod]);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const to = now.toISOString();
    const params = new URLSearchParams({ from, to });
    if (selectedNgoId !== 'all') params.set('ngo_id', selectedNgoId);
    apiGet(`/ngo-admin/call-analytics?${params}`)
      .then(data => { if (!cancelled) setCallAnalytics(data); })
      .catch(() => { if (!cancelled) setCallAnalytics(null); });
    return () => { cancelled = true };
  }, [selectedNgoId]);

  const [tlData, setTlData] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [followupTab, setFollowupTab] = useState('overdue');
  const [followupLoading, setFollowupLoading] = useState(false);
  const [showFollowups, setShowFollowups] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    const fetchTl = () => {
      apiGet(`/ngo-admin/tl-dashboard${ngoParam}`)
        .then(d => { if (!cancelled) setTlData(d); })
        .catch(() => { if (!cancelled) setTlData(null); });
    };
    fetchTl();
    const interval = setInterval(fetchTl, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedNgoId]);

  useEffect(() => {
    if (!showFollowups) return;
    let cancelled = false;
    setFollowupLoading(true);
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    apiGet(`/ngo-admin/followups${ngoParam}`)
      .then(d => { if (!cancelled) setFollowups(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setFollowups([]); })
      .finally(() => { if (!cancelled) setFollowupLoading(false); });
    return () => { cancelled = true };
  }, [showFollowups, selectedNgoId]);

  const fetchDashboard = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const ngoParam = selectedNgoId !== 'all' ? `?ngo_id=${selectedNgoId}` : '';
    const opts = { signal: controller.signal, timeout: 180000 };
    Promise.all([
      apiGet(`/ngo-admin/dashboard${ngoParam}`, opts),
      apiGet(`/ngo-admin/dashboard/station-stats${ngoParam}`, opts),
      apiGet('/ngo-admin/stations', opts),
    ])
      .then(([d, s, st]) => {
        if (!controller.signal.aborted) {
          setData(d);
          setStationStats(s);
          setStationsData(Array.isArray(st) ? st : []);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to load dashboard data');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return controller;
  }, [selectedNgoId]);

  useEffect(() => {
    const controller = fetchDashboard();
    return () => controller.abort();
  }, [fetchDashboard]);

  if (loading) return <SkeletonDashboard />;
  if (error || !data) {
    return (
      <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{ marginBottom: 6, fontWeight: 600, color: 'var(--ink)' }}>Could not load dashboard data</p>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>{error || 'The server took too long to respond. Please try again.'}</p>
        <button className="btn btn-primary" onClick={fetchDashboard} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Retry
        </button>
      </div>
    );
  }

  const stations = stationStats?.stations || {};
  const summary = stationStats?.summary || {};
  const stationNames = Object.keys(stations).sort((a, b) => {
    const idxA = a.lastIndexOf('-'), idxB = b.lastIndexOf('-');
    const numA = idxA > 0 ? parseInt(a.slice(idxA + 1)) || 0 : 0;
    const numB = idxB > 0 ? parseInt(b.slice(idxB + 1)) || 0 : 0;
    const preA = idxA > 0 ? a.slice(0, idxA) : a;
    const preB = idxB > 0 ? b.slice(0, idxB) : b;
    if (preA !== preB) return preA.localeCompare(preB);
    return numA - numB;
  });

  const getCell = (station, status) => stations[station]?.[status] || 0;
  const getStationTotal = (station) => Object.values(stations[station] || {}).reduce((t, v) => t + v, 0);

  const stationInfoMap = {};
  for (const st of stationsData) {
    stationInfoMap[st.station] = st;
  }

  const s = data.summary || {};
  const d = s.donors || {};
  const c = s.collection || {};
  const cm = c.month || {};
  const ct = c.today || {};
  const r = s.reactivations || {};
  const w = data.workers || {};
  const f = w.fro || {};
  const att = w.attendance || {};
  const a = data.assignments || {};

  const total_donors = Number(d.total) || 0;
  const assigned_donors = Number(d.assigned) || 0;
  const active_fros = Number(f.active) || 0;
  const month_collection = Number(cm.total) || 0;
  const today_collection = Number(ct.total) || 0;
  const daily_target = Number(c.daily_target) || 0;
  const verified_month_amount = Number(cm.verified?.amount) || 0;
  const verified_month_count = Number(cm.verified?.count) || 0;
  const unverified_month_amount = Number(cm.unverified?.amount) || 0;
  const unverified_month_count = Number(cm.unverified?.count) || 0;
  const verified_today_amount = Number(ct.verified?.amount) || 0;
  const verified_today_count = Number(ct.verified?.count) || 0;
  const unverified_today_amount = Number(ct.unverified?.amount) || 0;
  const unverified_today_count = Number(ct.unverified?.count) || 0;
  const total_workers = Number(f.total) || 0;
  const workers_present = Number(att.present) || 0;
  const workers_late = Number(att.late) || 0;
  const workers_absent = Number(att.absent) || 0;
  const workers_no_mark = Number(att.no_mark) || 0;
  const attendance_pct = Number(att.pct) || 0;
  const data_used = Number(a.data_connected) || 0;
  const data_unused = Number(a.data_unconnected) || 0;
  const active_donors = Number(d.active) || 0;
  const inactive_donors = Number(d.inactive) || 0;
  const reactivated_today = Number(r.today) || 0;
  const reactivated_monthly = Number(r.month) || 0;
  const total_fro_workers = Number(f.total) || 0;
  const assigned_fro_count = Number(f.with_assignments) || 0;
  const stations_per_ngo = data.stations_per_ngo || {};
  const unassigned = Math.max(0, total_donors - assigned_donors);
  const assignPct = Number(d.assigned_pct) || 0;
  const direct_donation_month = Math.max(0, month_collection - verified_month_amount - unverified_month_amount);
  const direct_donation_today = Math.max(0, today_collection - verified_today_amount - unverified_today_amount);

  const pieData = DISPOSITION_GROUPS.map(g => ({
    name: g.label,
    value: g.statuses.reduce((t, s) => t + (summary[s] || 0), 0),
    color: g.color,
  })).filter(d => d.value > 0);

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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 14, marginBottom: 20,
      }}>
        <div className="card" style={{ marginBottom: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Donor Assignment</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{total_donors}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[
                    { name: 'Assigned', value: assigned_donors, color: 'var(--sage)' },
                    { name: 'Unassigned', value: unassigned, color: '#e5e7eb' },
                  ]} cx="50%" cy="50%" innerRadius={20} outerRadius={30} dataKey="value" startAngle={90} endAngle={-270}>
                    <Cell fill="var(--sage)" />
                    <Cell fill="#e5e7eb" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: 'var(--sage)', fontWeight: 600 }}>Assigned</span>
                <span style={{ fontWeight: 600 }}>{assigned_donors}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#9ca3af', fontWeight: 500 }}>Unassigned</span>
                <span style={{ fontWeight: 500, color: '#9ca3af' }}>{unassigned}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{assignPct}% assigned</div>
            </div>
          </div>
          <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{data_used}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Used</div>
              </div>
              <div style={{ flex: 1, background: '#fef2f2', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>{data_unused}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Unused</div>
              </div>
            </div>
            {(data_used + data_unused) > 0 && (
              <div style={{ height: 4, borderRadius: 2, background: '#fee2e2', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${(data_used / (data_used + data_unused)) * 100}%`, height: '100%', borderRadius: 2, background: '#16a34a' }} />
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>FRO Workers</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10, textAlign:'center' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{total_fro_workers}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Total</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--sage)' }}>{active_fros}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Active</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{assigned_fro_count}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Assigned</div>
            </div>
          </div>
          {selectedNgoId === 'all' && Object.keys(stations_per_ngo).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6, textTransform:'uppercase' }}>Stations per NGO</div>
              {Object.entries(stations_per_ngo).map(([name, count]) => {
                const maxCount = Math.max(...Object.values(stations_per_ngo), 1);
                const pct = (count / maxCount) * 100;
                return (
                  <div key={name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600, minWidth:50, color:'var(--ink)' }}>{name}</span>
                    <div style={{ flex:1, height:6, borderRadius:3, background:'#e5e7eb', overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', borderRadius:3, background:'var(--sage)' }} />
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, minWidth:24, textAlign:'right', color:'var(--ink)' }}>{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '16px 18px', cursor: 'pointer' }} onClick={() => setSelectedPeriod('month')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Month Collection</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>₹{month_collection.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                <span style={{ fontWeight: 600 }}>₹{month_collection.toLocaleString('en-IN')}</span>
              </div>
              {month_collection > 0 && (
                <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: 2, background: '#16a34a', opacity: 0.6 }} />
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: month_collection > 0 ? 2 : 0 }}>
                {month_collection === 0 ? 'No collections yet' : 'Current month'}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '16px 18px', cursor: 'pointer' }} onClick={() => setSelectedPeriod('today')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Today Collection</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>₹{today_collection.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                <span style={{ fontWeight: 600 }}>₹{today_collection.toLocaleString('en-IN')}</span>
              </div>
              {today_collection > 0 && (
                <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: 2, background: '#f59e0b', opacity: 0.6 }} />
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: today_collection > 0 ? 2 : 0 }}>
                {today_collection === 0 ? 'No collections yet' : 'Today'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {daily_target > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600, flex: 1 }}>Daily Collection Target
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>Set by Super Admin</span>
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Target: <strong style={{ color: 'var(--ink)' }}>₹{daily_target.toLocaleString('en-IN')}</strong></span>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Collected: <strong style={{ color: '#16a34a' }}>₹{today_collection.toLocaleString('en-IN')}</strong></span>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Remaining: <strong style={{ color: today_collection >= daily_target ? '#16a34a' : '#ef4444' }}>₹{Math.max(0, daily_target - today_collection).toLocaleString('en-IN')}</strong></span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#fef2f2', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, (today_collection / daily_target) * 100)}%`,
              height: '100%',
              borderRadius: 4,
              background: today_collection >= daily_target ? '#16a34a' : today_collection >= daily_target * 0.5 ? '#f59e0b' : '#ef4444',
              transition: 'width .5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
            <span>{Math.round((today_collection / daily_target) * 100)}% achieved</span>
            <span>{today_collection >= daily_target ? 'Target completed!' : `${Math.round(((daily_target - today_collection) / daily_target) * 100)}% remaining`}</span>
          </div>
        </div>
      )}

      {/* ===== NEW SECTIONS FROM TL DASHBOARD ===== */}

      {/* Section 1: Idle Alert Banner */}
      {tlData?.idle_alerts?.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>Idle Alerts:</span>
          {tlData.idle_alerts.map(a => (
            <span key={a.fro_id} style={{ fontSize: 11, fontWeight: 500, color: '#78350f', background: '#fff', padding: '2px 10px', borderRadius: 12, border: '1px solid #fde68a' }}>
              {a.fro_name} — {a.idle_minutes}m idle
            </span>
          ))}
        </div>
      )}

      {/* Section 2: Telecaller Live Status Bar */}
      {tlData?.kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Telecallers', value: tlData.kpis.total_fros || 0, color: '#1e40af', bg: '#eff6ff' },
            { label: 'Calling', value: tlData.kpis.calling || 0, color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Idle', value: tlData.kpis.idle || 0, color: '#d97706', bg: '#fffbeb' },
            { label: 'Offline', value: tlData.kpis.offline || 0, color: '#dc2626', bg: '#fef2f2' },
            { label: 'Total Calls', value: tlData.kpis.total_calls || 0, color: '#7c3aed', bg: '#f5f3ff' },
            { label: 'Connected', value: tlData.kpis.connected || 0, color: '#0891b2', bg: '#ecfeff' },
            { label: 'Interested', value: tlData.kpis.interested || 0, color: '#db2777', bg: '#fdf2f8' },
            { label: 'Received', value: '₹' + Number(tlData.kpis.received_amount || 0).toLocaleString('en-IN'), color: '#16a34a', bg: '#f0fdf4', isAmount: true },
            { label: 'Follow-ups Due', value: tlData.kpis.followups_due || 0, color: '#ea580c', bg: '#fff7ed' },
            { label: 'Target %', value: (tlData.kpis.target_pct || 0) + '%', color: tlData.kpis.target_pct >= 75 ? '#16a34a' : '#dc2626', bg: tlData.kpis.target_pct >= 75 ? '#f0fdf4' : '#fef2f2' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ marginBottom: 0, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)', fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Section 3: Donation Funnel */}
      {tlData?.funnel?.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            Donation Funnel — Where Donors Drop Off
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', padding: '4px 0' }}>
            {tlData.funnel.map((stage, i) => {
              const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#16a34a'];
              const color = colors[i] || '#94a3b8';
              const isLast = i === tlData.funnel.length - 1;
              const maxCount = Math.max(...tlData.funnel.map(s => s.count), 1);
              return (
                <div key={stage.stage} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <div style={{ minWidth: 90, textAlign: 'center', padding: '8px 10px', borderRadius: 8, background: color + '12', border: `1px solid ${color}30` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>{stage.stage}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color }}>{(stage.count || 0).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 9, color: 'var(--ink-soft)', marginTop: 2 }}>{stage.pct}% of assigned</div>
                    <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: color, width: `${(stage.count / maxCount) * 100}%`, transition: 'width .6s ease' }} />
                    </div>
                  </div>
                  {!isLast && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 4+5: Hourly Performance + Top/Bottom Performers */}
      <div style={{ display: 'grid', gridTemplateColumns: tlData?.hourly?.length > 0 ? '2fr 1fr' : '1fr', gap: 14, marginBottom: 16 }}>
        {/* Hourly Performance Table */}
        {tlData?.hourly?.length > 0 && (
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-head">
              <h3 style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Hourly Performance
              </h3>
            </div>
            <div className="card-pad" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Time</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Calls</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Connected</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Interested</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Donations</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {tlData.hourly.map(h => {
                    const peakCalls = Math.max(...tlData.hourly.map(x => x.calls || 0), 1);
                    const intensity = (h.calls || 0) / peakCalls;
                    return (
                      <tr key={h.hour} style={{ background: intensity > 0.7 ? '#f0fdf4' : intensity < 0.3 && h.calls === 0 ? '#fef2f2' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{h.hour}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{h.calls || 0}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#16a34a' }}>{h.connected || 0}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ec4899' }}>{h.interested || 0}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#8b5cf6' }}>{h.donations || 0}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: (h.amount || 0) > 0 ? '#16a34a' : 'var(--ink-soft)' }}>
                          ₹{Number(h.amount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top/Bottom Performers */}
        {(tlData?.top_performers || tlData?.bottom_performers) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {tlData.top_performers?.amount?.length > 0 && (
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="card-head">
                  <h3 style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#f59e0b' }}>🏆</span> Top by Collection
                  </h3>
                </div>
                <div className="card-pad" style={{ padding: 0 }}>
                  {tlData.top_performers.amount.map((p, i) => (
                    <div key={p.fro_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: i < tlData.top_performers.amount.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : 'var(--ink-soft)', minWidth: 16 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.fro_name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>₹{Number(p.collection_amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tlData.bottom_performers?.target?.length > 0 && (
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="card-head">
                  <h3 style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚠️</span> Bottom by Target
                  </h3>
                </div>
                <div className="card-pad" style={{ padding: 0 }}>
                  {tlData.bottom_performers.target.map((p, i) => (
                    <div key={p.fro_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: i < tlData.bottom_performers.target.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.fro_name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: p.target_pct < 30 ? '#dc2626' : '#f59e0b' }}>{p.target_pct || 0}%</span>
                      <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, p.target_pct || 0)}%`, height: '100%', borderRadius: 2, background: p.target_pct < 30 ? '#dc2626' : '#f59e0b' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ marginBottom: 0, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Workforce</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{total_workers}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                      { name: 'Present', value: Math.max(0, workers_present), color: '#22c55e' },
                      { name: 'Late', value: Math.max(0, workers_late), color: '#f59e0b' },
                      { name: 'Absent', value: Math.max(0, workers_absent), color: '#ef4444' },
                      { name: 'No Show', value: Math.max(0, workers_no_mark), color: '#d1d5db' },
                    ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={20} outerRadius={30} dataKey="value" startAngle={90} endAngle={-270}>
                      <Cell fill="#22c55e" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#ef4444" />
                      <Cell fill="#d1d5db" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span style={{ color: '#22c55e', fontWeight: 600 }}>Present</span>
                  <span style={{ fontWeight: 600 }}>{workers_present}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span style={{ color: '#f59e0b', fontWeight: 500 }}>Late</span>
                  <span style={{ fontWeight: 500, color: '#f59e0b' }}>{workers_late}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#ef4444', fontWeight: 500 }}>Absent</span>
                  <span style={{ fontWeight: 500, color: '#ef4444' }}>{workers_absent}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{attendance_pct}% attendance</div>
              </div>
            </div>
            <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{workers_present}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Present</div>
                </div>
                <div style={{ flex: 1, background: '#fffbeb', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{workers_late}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Late</div>
                </div>
                <div style={{ flex: 1, background: '#fef2f2', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>{workers_absent}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Absent</div>
                </div>
                <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#6b7280' }}>{workers_no_mark}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>No Show</div>
                </div>
              </div>
              {total_workers > 0 && (
                <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', marginTop: 8, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${(workers_present / total_workers) * 100}%`, height: '100%', background: '#22c55e' }} />
                  <div style={{ width: `${(workers_late / total_workers) * 100}%`, height: '100%', background: '#f59e0b' }} />
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0, padding: '16px 18px', cursor: 'pointer', border: '1px solid #16a34a33' }} onClick={() => setSelectedStatus('verified')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Verified</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>₹{verified_month_amount.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)' }}>
              <span>Month: {verified_month_count} leads</span>
              <span>Today: ₹{verified_today_amount.toLocaleString('en-IN')} ({verified_today_count})</span>
            </div>
            {direct_donation_month > 0 && (
              <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 4 }}>
                + ₹{direct_donation_month.toLocaleString('en-IN')} in direct donations (total ₹{month_collection.toLocaleString('en-IN')})
              </div>
            )}
            <div style={{ fontSize: 10, color: '#16a34a', marginTop: direct_donation_month > 0 ? 2 : 4 }}>Verified by Accounts panel</div>
          </div>

          <div className="card" style={{ marginBottom: 0, padding: '16px 18px', cursor: 'pointer', border: '1px solid #f59e0b33' }} onClick={() => setSelectedStatus('unverified')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Unverified</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>₹{unverified_month_amount.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)' }}>
              <span>Month: {unverified_month_count} leads</span>
              <span>Today: ₹{unverified_today_amount.toLocaleString('en-IN')} ({unverified_today_count})</span>
            </div>
            <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>Awaiting Accounts verification</div>
          </div>
        </div>

        {weakPerformers.length > 0 && (
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-head">
              <h3>⚠ Low Performance</h3>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button onClick={() => setWeakPeriod('today')} disabled={weakLoading}
                  style={{ padding:'3px 10px', borderRadius:12, border:'1px solid var(--line)', fontSize:11, fontWeight:600, fontFamily:'inherit', cursor: weakLoading ? 'default' : 'pointer', opacity: weakLoading ? 0.6 : 1, background: weakPeriod === 'today' ? 'var(--sage)' : '#fff', color: weakPeriod === 'today' ? '#fff' : 'var(--ink)' }}>
                  Today
                </button>
                <button onClick={() => setWeakPeriod('month')} disabled={weakLoading}
                  style={{ padding:'3px 10px', borderRadius:12, border:'1px solid var(--line)', fontSize:11, fontWeight:600, fontFamily:'inherit', cursor: weakLoading ? 'default' : 'pointer', opacity: weakLoading ? 0.6 : 1, background: weakPeriod === 'month' ? 'var(--sage)' : '#fff', color: weakPeriod === 'month' ? '#fff' : 'var(--ink)' }}>
                  Month
                </button>
                {weakLoading && <span style={{ fontSize:11, color:'var(--ink-soft)', display:'flex', alignItems:'center', gap:4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="3" strokeLinecap="round" className="weak-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" className="weak-spin-arc"/></svg>
                  Loading…
                </span>}
              </div>
            </div>
            <div className="card-pad" style={{ padding:0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{width:30}}>#</th>
                    <th>FRO</th>
                    <th style={{textAlign:'right'}}>Collection</th>
                    <th style={{textAlign:'right'}}>Talk Time</th>
                    <th style={{textAlign:'center'}}>Leads</th>
                    <th style={{textAlign:'center'}}>Used</th>
                    <th style={{textAlign:'center'}}>Att.</th>
                    <th style={{textAlign:'center'}}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {weakPerformers.slice(0, showAllLowPerformers ? weakPerformers.length : 10).map((p, i) => (
                    <tr key={p.fro_id}>
                      <td style={{color:'var(--ink-soft)', fontSize:11}}>{i + 1}</td>
                      <td style={{fontWeight:600}}>{p.fro_name}</td>
                      <td style={{textAlign:'right', fontWeight:600}}>₹{p.collection_amount.toLocaleString('en-IN')}</td>
                      <td style={{textAlign:'right', fontSize:12, color:'var(--ink-soft)'}}>
                        {p.avg_talk_seconds > 0 ? `${Math.floor(p.avg_talk_seconds / 60)}m ${p.avg_talk_seconds % 60}s` : '—'}
                      </td>
                      <td style={{textAlign:'center'}}>{p.lead_done_count}</td>
                      <td style={{textAlign:'center'}}>{p.data_used}</td>
                      <td style={{textAlign:'center'}}>
                        {p.attendance_pct != null
                          ? <span style={{color: p.attendance_pct < 50 ? '#dc2626' : p.attendance_pct < 75 ? '#f59e0b' : '#16a34a', fontWeight:600}}>{p.attendance_pct}%</span>
                          : '—'}
                      </td>
                      <td style={{textAlign:'center', fontWeight:700, color:p.score < 0.2 ? '#dc2626' : '#f59e0b'}}>{p.score.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                {weakPerformers.length > 10 && !showAllLowPerformers && (
                  <tfoot>
                    <tr>
                      <td colSpan={8} style={{padding:0}}>
                        <button onClick={() => setShowAllLowPerformers(true)}
                          style={{width:'100%', padding:'10px 14px', border:'none', fontSize:12, fontWeight:600, fontFamily:'inherit', cursor:'pointer', background:'var(--sage-soft)', color:'var(--sage)', textAlign:'center', letterSpacing:.3}}>
                          View All {weakPerformers.length} FROs →
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes weakSpin { to { transform: rotate(360deg); } } .weak-spin { animation: weakSpin .6s linear infinite; transform-origin: center; }`}</style>

      {/* Section 6: Telecaller Performance Table */}
      {tlData?.performance?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Telecaller Performance
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}> — {froSearch ? tlData.performance.filter(p => p.fro_name?.toLowerCase().includes(froSearch.toLowerCase())).length : tlData.performance.length} FROs</span>
            </h3>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
              <input
                type="text"
                placeholder="Search FRO name..."
                value={froSearch}
                onChange={e => setFroSearch(e.target.value)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 11, fontFamily: 'inherit', outline: 'none', width: 160, background: 'var(--bg)', color: 'var(--ink)' }}
              />
              {[{ key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }].map(opt => (
                <button key={opt.key} onClick={() => setPerfPeriod(opt.key)} style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  border: `1px solid ${perfPeriod === opt.key ? 'var(--sage)' : 'var(--line)'}`,
                  background: perfPeriod === opt.key ? 'var(--sage)' : 'var(--bg)',
                  color: perfPeriod === opt.key ? '#fff' : 'var(--ink-soft)',
                  cursor: 'pointer',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="card-pad" style={{ padding: 0, overflowX: 'auto', maxHeight: 440, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>#</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Name</th>
                  <th className="perf-hide-mobile" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Station</th>
                  <th className="perf-hide-mobile" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Status</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Calls{perfPeriod === 'today' ? ' (Today)' : perfPeriod === 'week' ? ' (Week)' : ' (Month)'}</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Connected</th>
                  <th className="perf-hide-mobile" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Non-Connected</th>
                  <th className="perf-hide-mobile" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Interested</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Received{perfPeriod === 'today' ? ' (Today)' : perfPeriod === 'week' ? ' (Week)' : ' (Month)'}</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Target %</th>
                  <th className="perf-hide-mobile" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Claims</th>
                  <th className="perf-hide-mobile" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg, #fff)', padding: '10px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '2px solid var(--line)' }}>Conv %</th>
                </tr>
              </thead>
              <tbody>
                {tlData.performance.filter(p => !froSearch || p.fro_name?.toLowerCase().includes(froSearch.toLowerCase())).map((p, i) => {
                  const statusColors = { on_call: '#16a34a', online: '#3b82f6', idle: '#f59e0b', offline: '#9ca3af' };
                  const statusLabels = { on_call: 'Calling', online: 'Online', idle: 'Idle', offline: 'Offline' };
                  const sc = statusColors[p.status] || '#9ca3af';
                  const periodCalls = perfPeriod === 'today' ? (p.calls_today || 0) : perfPeriod === 'week' ? (p.calls_week || 0) : (p.calls || 0);
                  const periodConnected = perfPeriod === 'today' ? (p.connected_today || 0) : perfPeriod === 'week' ? (p.connected_week || 0) : (p.connected || 0);
                  const periodInterested = perfPeriod === 'today' ? (p.interested_today || 0) : perfPeriod === 'week' ? (p.interested_week || 0) : (p.interested || 0);
                  const periodReceived = perfPeriod === 'today' ? (p.receivedAmount_today || 0) : perfPeriod === 'week' ? (p.receivedAmount_week || 0) : (p.receivedAmount || 0);
                  const periodNonConnected = Math.max(0, periodCalls - periodConnected);
                  return (
                    <tr key={p.fro_id} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '10px', color: 'var(--ink-soft)', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ padding: '10px', fontWeight: 600 }}>
                        {p.fro_name}
                        <span className="perf-show-inline" style={{ fontSize: 10, color: sc, fontWeight: 500, marginLeft: 6 }}>
                          {statusLabels[p.status] || 'Offline'}
                        </span>
                        {p.stations?.length > 0 && (
                          <span className="perf-show-inline" style={{ display: 'block', fontSize: 9, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 1 }}>
                            {p.stations.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="perf-hide-mobile" style={{ padding: '10px', fontSize: 11, color: 'var(--ink-soft)' }}>
                        {p.stations?.length > 0 ? p.stations.map(s => (
                          <span key={s} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, background: '#f3f4f6', fontWeight: 500, marginRight: 3, marginBottom: 2 }}>{s}</span>
                        )) : '—'}
                      </td>
                      <td className="perf-hide-mobile" style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: sc }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc, display: 'inline-block' }} />
                          {statusLabels[p.status] || 'Offline'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>{periodCalls}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#16a34a', fontWeight: 600, cursor: 'pointer', textDecoration: periodConnected > 0 ? 'underline' : 'none' }}
                        onClick={(e) => { e.stopPropagation(); if (periodConnected > 0) setSelectedFro({ froId: p.fro_id, froName: p.fro_name, filterType: 'connected' }); }}>{periodConnected}</td>
                      <td className="perf-hide-mobile" style={{ padding: '10px', textAlign: 'right', color: '#dc2626', fontWeight: 600, cursor: 'pointer', textDecoration: periodNonConnected > 0 ? 'underline' : 'none' }}
                        onClick={(e) => { e.stopPropagation(); if (periodNonConnected > 0) setSelectedFro({ froId: p.fro_id, froName: p.fro_name, filterType: 'non_connected' }); }}>{periodNonConnected}</td>
                      <td className="perf-hide-mobile" style={{ padding: '10px', textAlign: 'right', color: '#ec4899' }}>{periodInterested}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: (periodReceived || 0) > 0 ? '#16a34a' : 'var(--ink-soft)' }}>
                        ₹{Number(periodReceived || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: (p.target_pct || 0) >= 75 ? '#16a34a' : (p.target_pct || 0) >= 50 ? '#f59e0b' : '#dc2626' }}>
                          {p.target_pct || 0}%
                        </span>
                      </td>
                      <td className="perf-hide-mobile" style={{ padding: '10px', textAlign: 'center', fontSize: 11 }}>
                        {p.claims_pending > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 8, fontWeight: 600, marginRight: 3 }}>{p.claims_pending}p</span>}
                        {p.claims_verified > 0 && <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: 8, fontWeight: 600, marginRight: 3 }}>{p.claims_verified}v</span>}
                        {p.claims_rejected > 0 && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>{p.claims_rejected}r</span>}
                        {(!p.claims_pending && !p.claims_verified && !p.claims_rejected) && <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                      </td>
                      <td className="perf-hide-mobile" style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: (p.conversion_pct || 0) >= 50 ? '#16a34a' : '#f59e0b' }}>
                        {p.conversion_pct || 0}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <style>{`
            .perf-show-inline { display: none; }
            @media (max-width: 768px) {
              .perf-hide-mobile { display: none !important; }
              .perf-show-inline { display: inline !important; }
            }
          `}</style>
        </div>
      )}

      {/* Section 7: Follow-up Management */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setShowFollowups(!showFollowups)}>
          <h3 style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Follow-up Management
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>{showFollowups ? '▲ collapse' : '▼ expand'}</span>
          </h3>
        </div>
        {showFollowups && (
          <div className="card-pad">
            {followupLoading ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>Loading follow-ups...</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[
                    { key: 'overdue', label: 'Overdue', color: '#dc2626', bg: '#fef2f2' },
                    { key: 'today', label: 'Today', color: '#ea580c', bg: '#fff7ed' },
                    { key: 'tomorrow', label: 'Tomorrow', color: '#2563eb', bg: '#eff6ff' },
                    { key: 'future', label: 'Future', color: '#6b7280', bg: '#f9fafb' },
                  ].map(tab => {
                    const count = followups.filter(f => f.bucket === tab.key).length;
                    return (
                      <button key={tab.key} onClick={() => setFollowupTab(tab.key)} style={{
                        padding: '5px 14px', borderRadius: 20, border: followupTab === tab.key ? `2px solid ${tab.color}` : '1px solid var(--line)',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                        background: followupTab === tab.key ? tab.bg : '#fff', color: followupTab === tab.key ? tab.color : 'var(--ink-soft)',
                      }}>
                        {tab.label} ({count})
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const filtered = followups.filter(f => f.bucket === followupTab);
                  if (filtered.length === 0) return <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>No {followupTab} follow-ups</div>;
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Donor</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Telecaller</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Date</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.slice(0, 20).map(f => (
                            <tr key={f.assignment_id} style={{ borderBottom: '1px solid var(--line)' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 500 }}>{f.donor_name || '—'}</td>
                              <td style={{ padding: '8px 10px', color: 'var(--ink-soft)' }}>{f.telecaller || '—'}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 11 }}>{f.followup_date || '—'}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  const newDate = prompt('New follow-up date (YYYY-MM-DD):', f.followup_date);
                                  if (newDate && newDate !== f.followup_date) {
                                    try {
                                      await apiPut(`/ngo-admin/followups/${f.assignmentId || f.assignment_id}/date`, { followup_date: newDate });
                                      setFollowups(prev => prev.map(x => x.assignment_id === f.assignment_id ? { ...x, followup_date: newDate } : x));
                                    } catch (err) { alert('Failed: ' + err.message); }
                                  }
                                }} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid var(--line)', borderRadius: 4, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                                  Change Date
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filtered.length > 20 && (
                        <div style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>
                          Showing 20 of {filtered.length} — go to Donor CRM for full list
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>

      {/* Call Connectivity Widget */}
      {(() => {
        const s = callAnalytics?.summary
        if (!s) return null
        const rateNum = parseInt(s.connection_rate) || 0
        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              Call Connectivity
              <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, marginLeft: 'auto' }}>
                Today · {s.connection_rate} connected
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 14 }}>
              <div className="card" style={{ marginBottom: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: rateNum >= 50 ? '#16a34a' : '#dc2626', lineHeight: 1.1 }}>{s.connection_rate}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>Connection Rate</div>
                <div style={{ fontSize: 9, color: 'var(--ink-soft)', marginTop: 1 }}>{s.connected} connected · {s.not_connected} not connected</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Top FROs</div>
                {callAnalytics?.by_fro?.slice(0, 3).map((f, i) => (
                  <div key={f.fro_worker_id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 8, color: 'var(--ink-soft)', minWidth: 12 }}>#{i + 1}</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fro_name}</span>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg)', flex: 1, maxWidth: 60 }}>
                        <div style={{ height: '100%', borderRadius: 2, width: Math.min((f.connected / Math.max(f.total, 1)) * 100, 100) + '%', background: '#16a34a' }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{Math.round((f.connected / Math.max(f.total, 1)) * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Bottom FROs</div>
                {callAnalytics?.by_fro?.slice(-3).reverse().map((f, i) => (
                  <div key={f.fro_worker_id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 8, color: 'var(--ink-soft)', minWidth: 12 }}>#{i + 1}</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fro_name}</span>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg)', flex: 1, maxWidth: 60 }}>
                        <div style={{ height: '100%', borderRadius: 2, width: Math.min((f.connected / Math.max(f.total, 1)) * 100, 100) + '%', background: '#dc2626' }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{Math.round((f.connected / Math.max(f.total, 1)) * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--ink-soft)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        Donor Health
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>

        <div className="card" style={{ marginBottom: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Active Donors</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#8b5cf6' }}>{active_donors}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Donated within last 1 year</div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Inactive Donors</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{inactive_donors}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>No donation in last 1 year</div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Reactivated Today</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{reactivated_today}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Inactive to active today</div>
        </div>

        <div className="card" style={{ marginBottom: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, flex: 1 }}>Reactivated Month</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>{reactivated_monthly}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Inactive to active this month</div>
        </div>
      </div>

    
      {selectedStation && (
        <StationDetailModal
          station={selectedStation}
          stats={stations[selectedStation]}
          stationInfo={stationInfoMap[selectedStation]}
          onClose={() => setSelectedStation(null)}
        />
      )}

      {selectedPeriod && (
        <CollectionDetailModal
          period={selectedPeriod}
          totalAmount={selectedPeriod === 'month' ? month_collection : today_collection}
          onClose={() => setSelectedPeriod(null)}
        />
      )}

      {selectedStatus && (
        <CollectionDetailModal
          status={selectedStatus}
          monthAmount={selectedStatus === 'verified' ? verified_month_amount : unverified_month_amount}
          monthCount={selectedStatus === 'verified' ? verified_month_count : unverified_month_count}
          todayAmount={selectedStatus === 'verified' ? verified_today_amount : unverified_today_amount}
          todayCount={selectedStatus === 'verified' ? verified_today_count : unverified_today_count}
          onClose={() => setSelectedStatus(null)}
        />
      )}

      {selectedFro && (
        <FroDetailModal
          froId={selectedFro.froId}
          froName={selectedFro.froName}
          filterType={selectedFro.filterType}
          perfPeriod={perfPeriod}
          onClose={() => setSelectedFro(null)}
        />
      )}

      <RecentNotices limit={5} />
    </div>
  );
}
