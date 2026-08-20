import { useState, useMemo } from 'react';
import { Calendar, ChevronRight, ChevronLeft, ArrowLeftRight, Clock, AlertTriangle, CheckCircle2, MoreVertical } from 'lucide-react';
import { Badge } from './Badge';
import { ActionMenu } from './ActionMenu';

const BUCKETS = [
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, color: '#dc2626', bg: '#fef2f2', borderColor: '#fecaca' },
  { key: 'today', label: 'Today', icon: Calendar, color: '#f59e0b', bg: '#fffbeb', borderColor: '#fde68a' },
  { key: 'tomorrow', label: 'Tomorrow', icon: Clock, color: '#3b82f6', bg: '#eff6ff', borderColor: '#bfdbfe' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, color: '#16a34a', bg: '#dcfce7', borderColor: '#bbf7d0' },
];

const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function FollowupManager({ 
  data, 
  onReassign, 
  onDateChange,
  availableFROs = [],
  loading = false 
}) {
  const [activeBucket, setActiveBucket] = useState('overdue');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [dateChangeOpen, setDateChangeOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const bucketData = useMemo(() => {
    const grouped = { overdue: [], today: [], tomorrow: [], completed: [] };
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    (data || []).forEach(item => {
      if (!item.followup_date) return;
      if (item.followup_date < todayStr) grouped.overdue.push(item);
      else if (item.followup_date === todayStr) grouped.today.push(item);
      else if (item.followup_date === tomorrowStr) grouped.tomorrow.push(item);
      else grouped.completed.push(item);
    });
    return grouped;
  }, [data]);

  const bucketCounts = useMemo(() => ({
    overdue: bucketData.overdue.length,
    today: bucketData.today.length,
    tomorrow: bucketData.tomorrow.length,
    completed: bucketData.completed.length,
  }), [bucketData]);

  const currentItems = bucketData[activeBucket] || [];

  const handleReassign = (item) => {
    setSelectedItem(item);
    setReassignOpen(true);
  };

  const handleDateChange = (item) => {
    setSelectedItem(item);
    setDateChangeOpen(true);
  };

  const confirmReassign = (froId, newDate) => {
    onReassign?.(selectedItem.assignment_id, froId, newDate);
    setReassignOpen(false);
    setSelectedItem(null);
  };

  const confirmDateChange = (newDate) => {
    onDateChange?.(selectedItem.assignment_id, newDate);
    setDateChangeOpen(false);
    setSelectedItem(null);
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Loading follow-ups…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Bucket Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {BUCKETS.map(bucket => {
          const count = bucketCounts[bucket.key] || 0;
          const isActive = activeBucket === bucket.key;
          return (
            <button
              key={bucket.key}
              onClick={() => setActiveBucket(bucket.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: isActive ? `1.5px solid ${bucket.color}` : '1px solid var(--line)',
                background: isActive ? bucket.bg : 'transparent',
                color: isActive ? bucket.color : 'var(--ink-soft)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <bucket.icon width="12" height="12" style={{ color: isActive ? bucket.color : 'inherit' }} />
              {bucket.label}
              <span style={{
                padding: '1px 6px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                background: isActive ? bucket.color : 'var(--line)',
                color: isActive ? '#fff' : 'var(--ink-soft)',
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, borderBottom: '1px solid var(--line)' }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, borderBottom: '1px solid var(--line)' }}>Telecaller</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, borderBottom: '1px solid var(--line)' }}>Donor</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, borderBottom: '1px solid var(--line)' }}>Mobile</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, borderBottom: '1px solid var(--line)' }}>Expected ₹</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, borderBottom: '1px solid var(--line)' }}>Follow-up Date</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, borderBottom: '1px solid var(--line)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                  No follow-ups in this bucket
                </td>
              </tr>
            ) : (
              currentItems.map((item, index) => (
                <tr key={item.assignment_id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--ink-soft)', fontSize: 11 }}>{index + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{item.telecaller}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500 }}>{item.donor_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{item.mobile}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{item.mobile}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>
                    {formatCurrency(item.expected_amount || item.amount_received || 0)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 11, color: 'var(--ink)' }}>
                    {formatDate(item.followup_date)}
                    {item.days_overdue > 0 && (
                      <Badge variant="danger" size="sm" style={{ marginLeft: 6 }}>{item.days_overdue}d overdue</Badge>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <ActionMenu
                      items={[
                        { label: 'Reassign', icon: <ArrowLeftRight />, onClick: () => handleReassign(item) },
                        { label: 'Change Date', icon: <Calendar />, onClick: () => handleDateChange(item) },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Reassign Modal */}
      {reassignOpen && selectedItem && (
        <div className="modal-overlay" onClick={() => { setReassignOpen(false); setSelectedItem(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3 style={{ margin: 0, fontSize: 14 }}>Reassign Follow-up</h3>
              <button className="btn btn-sm btn-outline" onClick={() => { setReassignOpen(false); setSelectedItem(null); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                <strong>{selectedItem.donor_name}</strong> — {selectedItem.telecaller}
              </div>
              <label className="field">
                Assign to Telecaller
                <select 
                  value={selectedItem.new_fro_id || ''} 
                  onChange={e => setSelectedItem({...selectedItem, new_fro_id: e.target.value})}
                >
                  <option value="">-- Select --</option>
                  {availableFROs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
              <label className="field">
                New Follow-up Date
                <input type="date" value={selectedItem.new_date || ''} onChange={e => setSelectedItem({...selectedItem, new_date: e.target.value})} />
              </label>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => { setReassignOpen(false); setSelectedItem(null); }}>Cancel</button>
                <button className="btn btn-primary" onClick={() => confirmReassign(selectedItem.new_fro_id, selectedItem.new_date)} disabled={!selectedItem.new_fro_id}>
                  Reassign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Change Modal */}
      {dateChangeOpen && selectedItem && (
        <div className="modal-overlay" onClick={() => { setDateChangeOpen(false); setSelectedItem(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <h3 style={{ margin: 0, fontSize: 14 }}>Change Follow-up Date</h3>
              <button className="btn btn-sm btn-outline" onClick={() => { setDateChangeOpen(false); setSelectedItem(null); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                <strong>{selectedItem.donor_name}</strong> — Current: {formatDate(selectedItem.followup_date)}
              </div>
              <label className="field">
                New Follow-up Date
                <input type="date" value={selectedItem.new_date || ''} onChange={e => setSelectedItem({...selectedItem, new_date: e.target.value})} />
              </label>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => { setDateChangeOpen(false); setSelectedItem(null); }}>Cancel</button>
                <button className="btn btn-primary" onClick={() => confirmDateChange(selectedItem.new_date)} disabled={!selectedItem.new_date}>
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FollowupManager;