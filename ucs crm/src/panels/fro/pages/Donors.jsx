import { useState, useEffect, useMemo } from 'react';
import { getMyDonors, getDonorDetail } from '../api/donors';
import { SkeletonDonors } from '../../../components/Skeleton';

const STATUS_PILL = {
  lead_done: 'pill-green', verified: 'pill-green', rejected: 'pill-red',
};

const DETAIL_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'sixmonths', label: 'Last 6 Months' },
  { id: 'monthly', label: 'Monthly' },
];

export default function Donors() {
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [filter, setFilter] = useState('all');
  const [detailFilter, setDetailFilter] = useState('all');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getMyDonors(null, null, { verifiedOnly: true }).then(data => { if (mounted) setDonors(data); }).catch(() => { if (mounted) setDonors([]); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const openDetail = async (d) => {
    setSelectedDonor(d);
    setDetail(null);
    setDetailFilter('all');
    try {
      const data = await getDonorDetail(d.id, d.ngo_id);
      setDetail(data);
    } catch {
      setDetail({ logs: [] });
    }
  };

  const closeDetail = () => {
    setSelectedDonor(null);
    setDetail(null);
    setDetailFilter('all');
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
    if (!detail?.logs) return [];
    const cutoff = new Date();
    if (detailFilter === 'yearly') cutoff.setFullYear(cutoff.getFullYear() - 1);
    else if (detailFilter === 'sixmonths') cutoff.setMonth(cutoff.getMonth() - 6);
    else if (detailFilter === 'monthly') cutoff.setDate(cutoff.getDate() - 30);
    return (detail.logs || []).filter(l => {
      if (!l.amount_collected && l.disposition_detail !== 'lead_done') return false;
      if (detailFilter === 'all') return true;
      return l.created_at && new Date(l.created_at) >= cutoff;
    });
  }, [detail, detailFilter]);

  const detailStats = useMemo(() => {
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

  if (loading) return <SkeletonDonors />;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid var(--line)', flexShrink:0 }}>
        <input type="text" placeholder="Search by name or mobile..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:1, padding:'7px 10px', border:'1px solid var(--line)', borderRadius:6, fontSize:12, fontFamily:'inherit' }} />
        <span style={{ fontSize:11, color:'var(--ink-soft)', fontWeight:600 }}>{filtered.length} donor{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ display:'flex', gap:6, padding:'8px 0', borderBottom:'1px solid var(--line)', flexShrink:0 }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'active', label: 'Active' },
          { id: 'inactive', label: 'Inactive' },
        ].map(tab => (
          <button key={tab.id} onClick={() => { setFilter(tab.id); closeDetail(); }}
            style={{
              padding:'5px 14px', border:`1px solid ${filter === tab.id ? 'var(--sage)' : 'var(--line)'}`,
              borderRadius:6, background: filter === tab.id ? 'var(--sage)' : '#fff',
              color: filter === tab.id ? '#fff' : 'var(--ink)',
              fontSize:10, fontWeight:700, fontFamily:'inherit', cursor:'pointer', transition:'all .12s',
            }}>
            {tab.label}
          </button>
        ))}
        {filter === 'active' && <span style={{ fontSize:10, color:'var(--ink-soft)', alignSelf:'center', marginLeft:4 }}>{donors.filter(d => d.has_donated_current_fy).length} active</span>}
        {filter === 'inactive' && <span style={{ fontSize:10, color:'var(--ink-soft)', alignSelf:'center', marginLeft:4 }}>{donors.filter(d => !d.has_donated_current_fy).length} inactive</span>}
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, fontSize:12, color:'var(--ink-soft)' }}>No donors found.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--line)' }}>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Name</th>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Status</th>
                <th style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, textTransform:'uppercase', color:'var(--ink-soft)' }}>Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} onClick={() => openDetail(d)}
                  style={{ borderBottom:'1px solid var(--line)', cursor:'pointer', background: selectedDonor?.id === d.id ? '#f0fdf4' : 'transparent' }}
                  onMouseOver={e => e.currentTarget.style.background = selectedDonor?.id === d.id ? '#e6f7e6' : 'var(--bg)'}
                  onMouseOut={e => e.currentTarget.style.background = selectedDonor?.id === d.id ? '#f0fdf4' : 'transparent'}>
                  <td style={{ padding:'8px 10px', fontWeight:600 }}>{d.donor_name || '—'}</td>
                  <td style={{ padding:'8px 10px' }}>
                    <span className={`pill ${STATUS_PILL[d.status] || 'pill-gray'}`}>{d.status?.replace(/_/g, ' ') || 'unknown'}</span>
                  </td>
                  <td style={{ padding:'8px 10px' }}>
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

        {selectedDonor && detail && (
          <div style={{ margin:'8px 0', border:'1px solid var(--line)', borderRadius:8, background:'#fff' }}>
            <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:700, fontSize:13 }}>Donor Details</span>
              <span onClick={closeDetail}
                style={{ fontSize:18, cursor:'pointer', color:'var(--ink-soft)' }}>✕</span>
            </div>

            <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--line)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontWeight:700, fontSize:15 }}>{selectedDonor.donor_name || '—'}</span>
                {selectedDonor.has_donated_current_fy ? (
                  <span className="pill pill-green">Active</span>
                ) : (
                  <span className="pill pill-gray">Inactive</span>
                )}
              </div>
              <div style={{ fontSize:11, color:'var(--ink-soft)', display:'flex', flexDirection:'column', gap:2 }}>
                <span>{selectedDonor.donor_mobile || '—'}  |  {selectedDonor.donor_city || '—'}</span>
                <span>PAN: {selectedDonor.donor_pan || '—'}  |  DOB: {selectedDonor.donor_dob ? new Date(selectedDonor.donor_dob).toLocaleDateString('en-GB') : '—'}</span>
                <span>Project: {selectedDonor.donor_project || '—'}</span>
                {selectedDonor.donor_address && <span>Address: {selectedDonor.donor_address}</span>}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:1, background:'var(--line)', borderBottom:'1px solid var(--line)' }}>
              {[
                { label: 'Total', value: `₹${detailStats.total.toLocaleString('en-IN')}` },
                { label: 'Donations', value: detailStats.count },
                { label: 'Last', value: detailStats.lastDate ? new Date(detailStats.lastDate).toLocaleDateString('en-GB') : '—' },
                { label: 'Status', value: selectedDonor.has_donated_current_fy ? '● Active' : '● Inactive', color: selectedDonor.has_donated_current_fy ? 'var(--sage)' : 'var(--ink-soft)' },
              ].map(s => (
                <div key={s.label} style={{ padding:'8px 10px', background:'#fff', textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'var(--ink-soft)', fontWeight:600, textTransform:'uppercase', marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color: s.color || 'var(--ink)' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ padding:'6px 10px', borderBottom:'1px solid var(--line)', display:'flex', gap:6 }}>
              {DETAIL_FILTERS.map(tab => (
                <button key={tab.id} onClick={() => setDetailFilter(tab.id)}
                  style={{
                    padding:'3px 10px', border:`1px solid ${detailFilter === tab.id ? 'var(--sage)' : 'var(--line)'}`,
                    borderRadius:5, background: detailFilter === tab.id ? 'var(--sage)' : '#fff',
                    color: detailFilter === tab.id ? '#fff' : 'var(--ink)',
                    fontSize:9, fontWeight:700, fontFamily:'inherit', cursor:'pointer', transition:'all .12s',
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ maxHeight:260, overflowY:'auto', display:'flex', flexDirection:'column', gap:3, padding:6 }}>
              {filteredLogs.length === 0 ? (
                <div style={{ textAlign:'center', padding:16, fontSize:11, color:'var(--ink-soft)' }}>No donation history for this period.</div>
              ) : (
                filteredLogs.map(l => (
                  <div key={l.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 8px', borderRadius:4, background:'var(--bg)', fontSize:11 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:12 }}>₹{Number(l.amount_collected || 0).toLocaleString('en-IN')}</span>
                      {l.disposition_detail === 'lead_done' && (
                        <span className="pill pill-green" style={{ fontSize:8 }}>lead_done</span>
                      )}
                      {l.accounts_status && (
                        <span className={`pill ${l.accounts_status === 'verified' ? 'pill-green' : l.accounts_status === 'rejected' ? 'pill-red' : 'pill-gray'}`} style={{ fontSize:8 }}>
                          {l.accounts_status === 'verified' ? 'Verified ✓' : l.accounts_status === 'rejected' ? 'Rejected ✗' : l.accounts_status}
                        </span>
                      )}
                    </div>
                    <span style={{ color:'var(--ink-soft)', fontSize:10, whiteSpace:'nowrap', marginLeft:8 }}>
                      {l.created_at ? new Date(l.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}