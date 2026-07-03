import { useState, useEffect, useMemo } from 'react';
import { getMyDonors, getDonorDetail, getFullDonorHistory } from '../api/donors';
import { SkeletonDonors } from '../../../components/Skeleton';

const STATUS_PILL = {
  lead_done: 'pill-green', verified: 'pill-green', rejected: 'pill-red',
};

const PERIOD_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'sixmonths', label: '6 Months' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'tenyears', label: '10 Years' },
];

const HISTORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'sixmonths', label: '6 Months' },
  { id: 'monthly', label: 'Monthly' },
];

export default function Donors() {
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [period, setPeriod] = useState('all');

  const [modalDonor, setModalDonor] = useState(null);
  const [modalDetail, setModalDetail] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [unlockAll, setUnlockAll] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getMyDonors(null, null, { verifiedOnly: true, period })
      .then(data => { if (mounted) setDonors(data); })
      .catch(() => { if (mounted) setDonors([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [period]);

  const openModal = async (d) => {
    setModalDonor(d);
    setModalDetail(null);
    setHistoryFilter('all');
    setUnlockAll(false);
    setModalLoading(true);
    try {
      const data = await getDonorDetail(d.id, d.ngo_id);
      setModalDetail(data);
    } catch {
      setModalDetail({ logs: [] });
    }
    setModalLoading(false);
  };

  const closeModal = () => {
    setModalDonor(null);
    setModalDetail(null);
    setHistoryFilter('all');
    setUnlockAll(false);
  };

  const handleUnlockFull = async () => {
    if (!modalDonor) return;
    setUnlockAll(true);
    setModalLoading(true);
    try {
      const data = await getFullDonorHistory(modalDonor.id, modalDonor.ngo_id, true);
      setModalDetail(data);
    } catch {
      // Keep existing detail
    }
    setModalLoading(false);
  };

  const searchFiltered = donors.filter(d =>
    !search || (d.donor_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.donor_mobile || '').includes(search)
  );

  const filtered = searchFiltered.filter(d => {
    if (filter === 'active') return d.has_donated_current_fy === true;
    if (filter === 'inactive') return !d.has_donated_current_fy;
    return true;
  });

  const filteredLogs = useMemo(() => {
    if (!modalDetail?.logs) return [];
    const cutoff = new Date();
    if (historyFilter === 'yearly') cutoff.setFullYear(cutoff.getFullYear() - 1);
    else if (historyFilter === 'sixmonths') cutoff.setMonth(cutoff.getMonth() - 6);
    else if (historyFilter === 'monthly') cutoff.setDate(cutoff.getDate() - 30);
    return (modalDetail.logs || []).filter(l => {
      if (historyFilter === 'all') return true;
      return l.created_at && new Date(l.created_at) >= cutoff;
    });
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

  if (loading) return <SkeletonDonors />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 5, padding: '6px 0', borderBottom: '1px solid var(--line)', flexShrink: 0, flexWrap: 'wrap' }}>
        {PERIOD_FILTERS.map(p => (
          <button key={p.id} onClick={() => handlePeriodChange(p.id)}
            style={{
              padding: '4px 12px', border: `1px solid ${period === p.id ? '#16a34a' : 'var(--line)'}`,
              borderRadius: 5, background: period === p.id ? '#16a34a' : '#fff',
              color: period === p.id ? '#fff' : 'var(--ink)',
              fontSize: 10, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <input type="text" placeholder="Search by name or mobile..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
        <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600 }}>{filtered.length} donor{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'active', label: 'Active' },
          { id: 'inactive', label: 'Inactive' },
        ].map(tab => (
          <button key={tab.id} onClick={() => { setFilter(tab.id); closeModal(); }}
            style={{
              padding: '5px 14px', border: `1px solid ${filter === tab.id ? 'var(--sage)' : 'var(--line)'}`,
              borderRadius: 6, background: filter === tab.id ? 'var(--sage)' : '#fff',
              color: filter === tab.id ? '#fff' : 'var(--ink)',
              fontSize: 10, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', transition: 'all .12s',
            }}>
            {tab.label}
          </button>
        ))}
        {filter === 'active' && <span style={{ fontSize: 10, color: 'var(--ink-soft)', alignSelf: 'center', marginLeft: 4 }}>{donors.filter(d => d.has_donated_current_fy).length} active</span>}
        {filter === 'inactive' && <span style={{ fontSize: 10, color: 'var(--ink-soft)', alignSelf: 'center', marginLeft: 4 }}>{donors.filter(d => !d.has_donated_current_fy).length} inactive</span>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 12, color: 'var(--ink-soft)' }}>No donors found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={`${d.id}-${d.ngo_id}`} onClick={() => openModal(d)}
                  style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', background: modalDonor?.id === d.id ? '#f0fdf4' : 'transparent' }}
                  onMouseOver={e => e.currentTarget.style.background = modalDonor?.id === d.id ? '#e6f7e6' : 'var(--bg)'}
                  onMouseOut={e => e.currentTarget.style.background = modalDonor?.id === d.id ? '#f0fdf4' : 'transparent'}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.donor_name || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span className={`pill ${STATUS_PILL[d.status] || 'pill-gray'}`}>{d.status?.replace(/_/g, ' ') || 'unknown'}</span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {d.has_donated_current_fy ? (
                      <span className="pill pill-green">Active</span>
                    ) : (
                      <span className="pill pill-gray">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <span>{modalDonor.donor_mobile || '—'}</span>
                <span className="donor-modal-sep">|</span>
                <span>{modalDonor.donor_city || '—'}</span>
                {modalDonor.donor_pan && <><span className="donor-modal-sep">|</span><span>PAN: {modalDonor.donor_pan}</span></>}
                {modalDonor.donor_dob && <><span className="donor-modal-sep">|</span><span>DOB: {new Date(modalDonor.donor_dob).toLocaleDateString('en-GB')}</span></>}
              </div>
              {modalDonor.donor_project && <div className="donor-modal-project">Project: {modalDonor.donor_project}</div>}
              {modalDonor.donor_address && <div className="donor-modal-address">Address: {modalDonor.donor_address}</div>}
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
                  className={`donor-modal-hf-btn ${historyFilter === tab.id ? 'active' : ''}`}>
                  {tab.label}
                </button>
              ))}
              {!unlockAll && (
                <button className="donor-modal-unlock-btn" onClick={handleUnlockFull}>
                  &#128274; Unlock Full
                </button>
              )}
              {unlockAll && <span className="donor-modal-unlocked-badge">&#128275; Full History</span>}
            </div>

            <div className="donor-modal-logs">
              {modalLoading ? (
                <div className="donor-modal-empty">Loading...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="donor-modal-empty">No donation history for this period.</div>
              ) : (
                filteredLogs.map(l => (
                  <div key={l.id} className="donor-modal-log-row">
                    <div className="donor-modal-log-left">
                      <span className="donor-modal-log-amount">₹{Number(l.amount_collected || 0).toLocaleString('en-IN')}</span>
                      {l.disposition_detail === 'lead_done' && (
                        <span className="pill pill-green" style={{ fontSize: 8 }}>lead_done</span>
                      )}
                      {l.accounts_status && (
                        <span className={`pill ${l.accounts_status === 'verified' ? 'pill-green' : l.accounts_status === 'rejected' ? 'pill-red' : 'pill-gray'}`} style={{ fontSize: 8 }}>
                          {l.accounts_status === 'verified' ? 'Verified ✓' : l.accounts_status === 'rejected' ? 'Rejected ✗' : l.accounts_status}
                        </span>
                      )}
                    </div>
                    <span className="donor-modal-log-date">
                      {l.created_at ? new Date(l.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}