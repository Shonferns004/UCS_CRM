import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CheckCircle2, UserX, Smartphone, ChevronRight, Phone, Search, Inbox, MapPin } from 'lucide-react';
import { getMyDonors, getDonorDetail, getFullDonorHistory, getDonorReceipts } from '../api/donors';
import { SkeletonDonors } from '../../../components/Skeleton';
import { getWhatsAppChatUrl } from '../utils/whatsappProject';

const PERIOD_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'sixmonths', label: '6 Months' },
  { id: 'yearly', label: 'Yearly' },
];

const HISTORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'sixmonths', label: '6 Months' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'tenyears', label: '10 Years' },
];

const ACTIVITY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

export default function Donors() {
  const navigate = useNavigate();
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [period, setPeriod] = useState('all');

  const [modalDonor, setModalDonor] = useState(null);
  const [modalDetail, setModalDetail] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [unlocked, setUnlocked] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const opts = { verifiedOnly: true, period };
    if (filter === 'active') opts.activeOnly = true;
    else if (filter === 'inactive') opts.inactiveOnly = true;
    getMyDonors(null, null, opts)
      .then(data => { if (mounted) setDonors(Array.isArray(data) ? data : (data?.donors || [])); })
      .catch((err) => { console.error('API error:', err.message); if (mounted) setDonors([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [period, filter]);

  useEffect(() => { setPage(1); }, [search, filter, period, perPage]);

  const openModal = useCallback(async (d) => {
    setModalDonor(d);
    setModalDetail(null);
    setReceiptData(null);
    setHistoryFilter('all');
    setUnlocked(false);
    setModalLoading(true);
    try {
      const data = await getDonorDetail(d.id, d.ngo_id);
      setModalDetail(data);
    } catch {
      setModalDetail({ logs: [] });
    }
    try {
      const data = await getDonorReceipts(d.id, d.ngo_id);
      setReceiptData(data);
    } catch {
      // receipts optional
    }
    setModalLoading(false);
  }, []);

  const closeModal = useCallback(() => {
    setModalDonor(null);
    setModalDetail(null);
    setReceiptData(null);
    setHistoryFilter('all');
    setUnlocked(false);
  }, []);

  const handleToggleLock = useCallback(async () => {
    if (!modalDonor) return;
    if (unlocked) {
      setUnlocked(false);
      setHistoryFilter('all');
      setModalLoading(true);
      try {
        const data = await getDonorDetail(modalDonor.id, modalDonor.ngo_id);
        setModalDetail(data);
      } catch {
        setModalDetail({ logs: [] });
      }
      setModalLoading(false);
    } else {
      setUnlocked(true);
      setModalLoading(true);
      try {
        const data = await getFullDonorHistory(modalDonor.id, modalDonor.ngo_id, true);
        setModalDetail(data);
      } catch {
        // keep existing
      }
      setModalLoading(false);
    }
  }, [modalDonor, unlocked]);

  const searchFiltered = donors.filter(d =>
    !search || (d.donor_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.donor_mobile || '').includes(search)
  );

  const filtered = searchFiltered.filter(d => {
    if (filter === 'active') return d.has_donated_current_fy === true;
    if (filter === 'inactive') return !d.has_donated_current_fy;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginatedDonors = filtered.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => ({
    total: donors.length,
    active: donors.filter(d => d.has_donated_current_fy === true).length,
    inactive: donors.filter(d => !d.has_donated_current_fy).length,
    withMobile: donors.filter(d => d.donor_mobile).length,
  }), [donors]);

  const CHIPS = [
    { key: 'total', label: 'Total Donors', value: stats.total, Icon: Users, bg: '#eef2ff', color: '#4338ca' },
    { key: 'active', label: 'Active', value: stats.active, Icon: CheckCircle2, bg: '#dcfce7', color: '#15803d' },
    { key: 'inactive', label: 'Inactive', value: stats.inactive, Icon: UserX, bg: '#f3f4f6', color: '#6b7280' },
    { key: 'withMobile', label: 'With Mobile', value: stats.withMobile, Icon: Smartphone, bg: '#fef3c7', color: '#b45309' },
  ];

  const filteredLogs = useMemo(() => {
    if (!modalDetail?.logs) return [];
    let filtered = modalDetail.logs.filter(l =>
      l.action === 'donation' || l.disposition_detail === 'done' || (l.disposition_detail === 'lead_done' && l.accounts_status === 'verified')
    );
    let cutoff;
    if (historyFilter === 'tenyears') {
      cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 10);
    } else if (historyFilter === 'yearly') {
      cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
    } else if (historyFilter === 'sixmonths') {
      cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 6);
    } else if (historyFilter === 'monthly') {
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
    }
    if (cutoff) {
      filtered = filtered.filter(l => l.created_at && new Date(l.created_at) >= cutoff);
    }
    return filtered;
  }, [modalDetail, historyFilter]);

  const modalStats = useMemo(() => {
    let total = 0, count = 0, lastDate = null;
    for (const l of filteredLogs) {
      if (l.amount_collected) {
        total += Number(l.amount_collected);
        count++;
        if (!lastDate || new Date(l.created_at) > new Date(lastDate)) lastDate = l.created_at;
      }
    }
    return { total, count, lastDate };
  }, [filteredLogs]);

  const handlePeriodChange = (p) => {
    if (p === period) return;
    setPeriod(p);
  };

  const goWhatsApp = (d) => {
    localStorage.setItem('donors_last_view', JSON.stringify({ page, perPage, search, filter, period }));
    navigate(getWhatsAppChatUrl(d));
  };

  const segmentedPill = (bg, border, radius, padding) => ({
    display: 'inline-flex', background: bg, border, borderRadius: radius, padding,
  });

  const segBtn = (active) => ({
    padding: '6px 16px', borderRadius: 999, border: 'none', fontFamily: 'inherit',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    background: active ? 'var(--sage)' : 'transparent', color: active ? '#fff' : 'var(--ink-soft)',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,.18)' : 'none', transition: 'all .15s',
  });

  const segCount = (active) => ({
    minWidth: 17, padding: '0 5px', borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: active ? 'rgba(255,255,255,.22)' : 'var(--line)', color: active ? '#fff' : 'var(--ink-soft)',
  });

  if (loading) return <SkeletonDonors />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {/* Stat chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, padding: '14px 18px 4px', flexShrink: 0 }}>
        {CHIPS.map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)', padding: '10px 14px' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <c.Icon size={15} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar: period filter + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 18px 8px', flexShrink: 0 }}>
        <div style={segmentedPill('var(--bg)', '1px solid var(--line)', 999, 3)}>
          {PERIOD_FILTERS.map(p => (
            <button key={p.id} onClick={() => handlePeriodChange(p.id)} style={segBtn(period === p.id)}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or mobile…"
            style={{
              padding: '7px 12px 7px 30px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--card-bg)',
              fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 210, color: 'var(--ink)',
            }}
          />
        </div>
      </div>

      {/* Activity filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 18px 10px', flexShrink: 0 }}>
        <div style={segmentedPill('var(--bg)', '1px solid var(--line)', 999, 3)}>
          {ACTIVITY_TABS.map(tab => {
            const count = tab.id === 'active' ? stats.active : tab.id === 'inactive' ? stats.inactive : stats.total;
            const active = filter === tab.id;
            return (
              <button key={tab.id} onClick={() => setFilter(tab.id)} style={segBtn(active)}>
                {tab.label}
                <span style={segCount(active)}>{count}</span>
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, marginLeft: 'auto' }}>
          {filtered.length} donor{filtered.length !== 1 ? 's' : ''} · Page {page} of {totalPages}
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 18px 18px' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 220, gap: 10, color: 'var(--ink-soft)' }}>
            <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Inbox size={24} />
            </span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{search || filter !== 'all' ? 'No matching donors' : 'No donors yet'}</div>
            <div style={{ fontSize: 11 }}>{search || filter !== 'all' ? 'Try a different name, mobile or filter.' : 'Verified donors will appear here.'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paginatedDonors.map(d => {
              const statusPill = d.has_donated_current_fy
                ? { bg: '#dcfce7', color: '#15803d', label: 'Active' }
                : { bg: '#f3f4f6', color: '#6b7280', label: 'Inactive' };
              return (
                <div key={`${d.id}-${d.ngo_id}`} onClick={() => openModal(d)}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--sage)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'var(--card-bg)', border: modalDonor?.id === d.id ? '1px solid var(--sage)' : '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)', cursor: 'pointer',
                    transition: 'transform .12s, box-shadow .12s, border-color .12s',
                  }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#5B6B4E1A', color: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {initials(d.donor_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.donor_name || '—'}</span>
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: statusPill.bg, color: statusPill.color }}>
                        {statusPill.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-soft)', marginTop: 3, flexWrap: 'wrap' }}>
                      <Phone size={11} />
                      <span>{d.donor_mobile || '—'}</span>
                      {d.donor_city && <><span style={{ color: 'var(--line)', margin: '0 2px' }}>•</span><MapPin size={10} /><span>{d.donor_city}</span></>}
                      {d.donor_project && <><span style={{ color: 'var(--line)', margin: '0 2px' }}>•</span><span>{d.donor_project}</span></>}
                    </div>
                  </div>
                  {d.donor_mobile && (
                    <button onClick={e => { e.stopPropagation(); goWhatsApp(d); }}
                      title="Chat on WhatsApp"
                      style={{ border: 'none', background: '#25D366', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, transition: 'filter .12s' }}
                      onMouseOver={e => e.currentTarget.style.filter = 'brightness(.95)'}
                      onMouseOut={e => e.currentTarget.style.filter = 'none'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </button>
                  )}
                  <ChevronRight size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0 0', flexShrink: 0 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '6px 14px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--card-bg)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1, color: 'var(--ink)' }}>
              &larr; Prev
            </button>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>Page {page} of {totalPages}</span>
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); }}
              style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 999, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--ink)' }}>
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '6px 14px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--card-bg)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1, color: 'var(--ink)' }}>
              Next &rarr;
            </button>
          </div>
        )}
      </div>

      {modalDonor && (
        <div className="donor-modal-overlay" onClick={closeModal}>
          <div className="donor-modal" onClick={e => e.stopPropagation()}>
            <div className="donor-modal-header">
              <div className="donor-modal-title-row">
                <span className="donor-modal-name">{modalDonor.donor_name || 'Unknown'}</span>
                {modalDonor.has_donated_current_fy ? (
                  <span className="pill pill-green">Active</span>
                ) : (
                  <span className="pill pill-gray">Inactive</span>
                )}
                <button className="donor-modal-close" onClick={closeModal}>&times;</button>
              </div>
              <div className="donor-modal-info">
                <span>&#128222; {modalDonor.donor_mobile || '—'}</span>
                <span className="donor-modal-sep">|</span>
                <span>&#9993; {modalDetail?.donor?.email || '—'}</span>
                <span className="donor-modal-sep">|</span>
                <span>&#127963; {modalDonor.donor_city || '—'}</span>
                {modalDonor.donor_pan && <><span className="donor-modal-sep">|</span><span>PAN: {modalDonor.donor_pan}</span></>}
                {modalDonor.donor_dob && <><span className="donor-modal-sep">|</span><span>DOB: {new Date(modalDonor.donor_dob).toLocaleDateString('en-GB')}</span></>}
              </div>
              {modalDonor.donor_project && <div className="donor-modal-project">&#128196; Project: {modalDonor.donor_project}</div>}
              {modalDonor.donor_address && <div className="donor-modal-address">&#127968; {modalDonor.donor_address}</div>}
            </div>

            <div className="donor-modal-stats">
              {[
                { label: 'Total', value: `₹${modalStats.total.toLocaleString('en-IN')}`, color: 'var(--sage)' },
                { label: 'Donations', value: modalStats.count, color: 'var(--ink)' },
                { label: 'Last', value: modalStats.lastDate ? new Date(modalStats.lastDate).toLocaleDateString('en-GB') : '—', color: 'var(--ink-soft)' },
                { label: 'Status', value: modalDonor.has_donated_current_fy ? '● Active' : '● Inactive', color: modalDonor.has_donated_current_fy ? 'var(--sage)' : 'var(--ink-soft)' },
              ].map(s => (
                <div key={s.label} className="donor-modal-stat-item">
                  <div className="donor-modal-stat-label">{s.label}</div>
                  <div className="donor-modal-stat-value" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="donor-modal-history-filters">
              {HISTORY_FILTERS.map(tab => (
                <button key={tab.id} onClick={() => setHistoryFilter(tab.id)}
                  className={`donor-modal-hf-btn ${historyFilter === tab.id ? 'active' : ''}`}
                  style={(tab.id === 'tenyears' && !unlocked) ? { opacity: 0.5 } : {}}>
                  {tab.label}
                </button>
              ))}
              <button className={`donor-modal-lock-toggle ${unlocked ? 'unlocked' : ''}`} onClick={handleToggleLock}>
                {unlocked ? '\u{1F513} Unlocked' : '\u{1F512} Locked'}
              </button>
            </div>

            <div className="donor-modal-logs">
              {modalLoading ? (
                <div className="donor-modal-empty">Loading...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="donor-modal-empty">No donation history for this period.</div>
              ) : (
                <table className="donor-modal-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Mode</th>
                      <th>Payment ID</th>
                      <th>Status</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(l => (
                      <tr key={l.id}>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                          {(() => {
                            const d = (l.action === 'donation' || (l.disposition_detail === 'lead_done' && l.accounts_status === 'verified'))
                              ? (l.transaction_datetime || l.verified_at || l.created_at)
                              : l.created_at;
                            return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                          })()}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--sage)' }}>
                          ₹{Number(l.amount_collected || 0).toLocaleString('en-IN')}
                          {l.fro_worker_name && (
                            <div style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: 9, marginTop: 1 }}>
                              by {l.fro_worker_name}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {l.payment_mode || l.mode || '—'}
                        </td>
                        <td style={{ fontSize: 10, fontFamily: 'monospace', color: '#6b7280' }}>
                          {l.upi_transaction_id ? `*${l.upi_transaction_id}` : l.payment_id ? `*${l.payment_id}` : '—'}
                        </td>
                        <td>
                          {l.accounts_status === 'verified' ? (
                            <span className="pill pill-green" style={{ fontSize: 9 }}>&#10003; Verified</span>
                          ) : l.accounts_status === 'rejected' ? (
                            <span className="pill pill-red" style={{ fontSize: 9 }}>&#10007; Rejected</span>
                          ) : l.accounts_status === 'pending' ? (
                            <span className="pill pill-yellow" style={{ fontSize: 9 }}>&#9203; Pending</span>
                          ) : (
                            <span className="pill pill-gray" style={{ fontSize: 9 }}>—</span>
                          )}
                        </td>
                        <td>
                          {l.accounts_status === 'verified' && (
                            <button className="btn btn-sm" style={{ fontSize: 9, padding: '2px 6px', background: 'var(--sage)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); alert('Receipt preview coming soon') }}>
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {receiptData && receiptData.receipts && receiptData.receipts.length > 0 && (
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}>
                <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: .5 }}>
                  Receipts from Accounts ({receiptData.count}) &middot; Total: ₹{receiptData.totalAmount.toLocaleString('en-IN')}
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {receiptData.receipts.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderTop: '1px solid var(--line)', fontSize: 11 }}>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--ink)', minWidth: 70 }}>{r.receipt_no}</span>
                      <span style={{ color: 'var(--ink-soft)', minWidth: 90 }}>{r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                      <span style={{ fontWeight: 700, color: 'var(--sage)', marginLeft: 'auto' }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
