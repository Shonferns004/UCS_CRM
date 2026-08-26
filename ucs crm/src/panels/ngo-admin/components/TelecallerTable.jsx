import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { 
  Search, Filter, Download, ChevronDown, 
  MoreVertical, Eye, ArrowLeftRight, Calendar, 
  CheckCircle2, Phone, Trash2, AlertTriangle,
  Activity, Clock, UserX, Coffee
} from 'lucide-react';
import { Badge } from './Badge';
import { ActionMenu } from './ActionMenu';
import { StatusBadge } from './StatusBadge';

const STATUS_CONFIG = {
  calling: { icon: <Activity className="w-3 h-3 animate-pulse" />, label: 'Calling', color: 'green', bg: 'bg-green-50' },
  idle: { icon: <Clock className="w-3 h-3" />, label: 'Idle', color: 'amber', bg: 'bg-amber-50', alert: true },
  offline: { icon: <UserX className="w-3 h-3" />, label: 'Offline', color: 'gray', bg: 'bg-gray-50' },
  break: { icon: <Coffee className="w-3 h-3" />, label: 'Break', color: 'blue', bg: 'bg-blue-50' },
};

const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

export function TelecallerTable({ 
  data, 
  onRowAction, 
  onSort, 
  onFilter,
  loading = false,
  sortConfig = { key: null, direction: 'asc' },
  filterValue = '',
  hourlyData = [],
  period = 'today',
}) {
  const [search, setSearch] = useState(filterValue);
  const [sortKey, setSortKey] = useState(sortConfig.key);
  const [sortDirection, setSortDirection] = useState(sortConfig.direction);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    onSort?.({ key, direction: sortKey === key ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc' });
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // Connected statuses - we'll create a breakdown from the data
    const connectedStatusLabels = {
      connected: 'Connected',
      interested: 'Interested',
      receivedDonors: 'Received',
      // Add more as needed based on data
    };

    // Sheet 1: Telecaller Performance Summary
    const summaryHeaders = [
      'Telecaller', 'Login ID', 'Calls', 'Connected', 'Non-Connected',
      'Connected Status Breakdown', 'Interested', 'Received Donors', 'Amount (₹)', 'Target %',
      'Claims Pending', 'Claims Verified', 'Claims Rejected', 'Live Status'
    ];
    const summaryRows = sortedData.map(row => {
      const nonConnected = Math.max(0, row.calls - row.connected);
      // Create connected status breakdown from available data
      const connectedBreakdown = [
        `Connected: ${row.connected}`,
        `Interested: ${row.interested}`,
        `Received: ${row.receivedDonors}`
      ].join('; ');
      
      return [
        row.fro_name,
        row.fro_login_id || '',
        row.calls,
        row.connected,
        nonConnected,
        connectedBreakdown,
        row.interested,
        row.receivedDonors,
        row.receivedAmount,
        row.targetPct,
        row.claims_pending || 0,
        row.claims_verified || 0,
        row.claims_rejected || 0,
        row.status || 'offline'
      ];
    });
    const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    summarySheet['!cols'] = [
      { wch: 25 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
      { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Telecaller Performance');

    // Sheet 2: Hourly Performance (if data available)
    if (hourlyData && hourlyData.length > 0) {
      const hourlyHeaders = ['Hour', 'Calls', 'Connected', 'Interested', 'Donations', 'Amount (₹)'];
      const hourlyRows = hourlyData.map(d => [
        d.hour,
        d.calls,
        d.connected,
        d.interested,
        d.donations,
        d.amount
      ]);
      const hourlySheet = XLSX.utils.aoa_to_sheet([hourlyHeaders, ...hourlyRows]);
      hourlySheet['!cols'] = [
        { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }
      ];
      XLSX.utils.book_append_sheet(wb, hourlySheet, 'Hourly Breakdown');
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `telecaller-performance-${period}-${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const sortedData = useMemo(() => {
    let result = [...data];
    
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d => 
        (d.fro_name || '').toLowerCase().includes(q) ||
        (d.fro_login_id || '').toLowerCase().includes(q)
      );
    }
    
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal === bVal) return 0;
        const dir = sortDirection === 'asc' ? 1 : -1;
        if (typeof aVal === 'string') return aVal.localeCompare(bVal) * dir;
        return (aVal - bVal) * dir;
      });
    }
    return result;
  }, [data, search, sortKey, sortDirection]);

  const columns = [
    { key: 'fro_name', header: 'Telecaller', sortable: true, render: 'avatar' },
    { key: 'calls', header: 'Calls', sortable: true, align: 'right' },
    { key: 'connected', header: 'Connected', sortable: true, align: 'right' },
    { key: 'interested', header: 'Interested', sortable: true, align: 'right' },
    { key: 'receivedDonors', header: 'Received', sortable: true, align: 'right' },
    { key: 'receivedAmount', header: 'Amount (₹)', sortable: true, align: 'right', render: 'currency' },
    { key: 'targetPct', header: 'Target %', sortable: true, align: 'right', render: 'pct' },
    { key: 'claims', header: 'Claims', sortable: false, align: 'center', render: 'claims' },
    { key: 'actions', header: 'Action', sortable: false, render: 'actions' },
    { key: 'status', header: 'Live Status', sortable: false, render: 'status' },
  ];

  if (loading) {
    return (
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 48, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>No telecallers found</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search width="16" height="16" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          <input
            type="text"
            placeholder="Search telecaller..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--ink)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button 
            onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
          >
            <Download width="14" height="14" />
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {columns.map(col => (
                <th 
                  key={col.key}
                  style={{ 
                    padding: '12px 16px', 
                    textAlign: col.align || 'left',
                    fontWeight: 600,
                    color: 'var(--ink-soft)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontSize: 10,
                    borderBottom: '1px solid var(--line)',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      sortDirection === 'asc' ? '↑' : '↓'
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, index) => (
              <tr key={row.fro_id} style={{ 
                borderBottom: '1px solid var(--line)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {/* Telecaller Name with Avatar */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: '50%', 
                      background: 'var(--sage)', 
                      color: '#fff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: 13, 
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {(row.fro_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{row.fro_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{row.fro_login_id || ''}</div>
                    </div>
                  </div>
                </td>

                {/* Calls */}
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {row.calls}
                </td>

                {/* Connected */}
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#3b82f6' }}>
                  {row.connected}
                </td>

                {/* Interested */}
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#ec4899' }}>
                  {row.interested}
                </td>

                {/* Received Donors */}
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>
                  {row.receivedDonors}
                </td>

                {/* Amount */}
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>
                  {formatCurrency(row.receivedAmount)}
                </td>

                {/* Target % */}
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ 
                    color: row.targetPct >= 100 ? '#16a34a' : row.targetPct >= 75 ? '#8b5cf6' : row.targetPct >= 50 ? '#f59e0b' : '#dc2626',
                    fontWeight: 700,
                  }}>
                    {row.targetPct}%
                  </span>
                </td>

                {/* Claims */}
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {row.claims_pending > 0 && <Badge variant="warning" size="sm">{row.claims_pending} P</Badge>}
                    {row.claims_verified > 0 && <Badge variant="success" size="sm">{row.claims_verified} V</Badge>}
                    {row.claims_rejected > 0 && <Badge variant="danger" size="sm">{row.claims_rejected} R</Badge>}
                    {row.claims_pending === 0 && row.claims_verified === 0 && row.claims_rejected === 0 && (
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td style={{ padding: '12px 16px' }}>
                  <ActionMenu
                    items={[
                      { label: 'View Details', icon: <Eye />, action: 'view', onClick: () => onRowAction?.('view', row) },
                      { label: 'Reassign Donors', icon: <ArrowLeftRight />, action: 'reassign', onClick: () => onRowAction?.('reassign', row) },
                      { label: 'Change Follow-up', icon: <Calendar />, action: 'followup', onClick: () => onRowAction?.('followup', row) },
                      { label: 'Verify Payment', icon: <CheckCircle2 />, action: 'verify', onClick: () => onRowAction?.('verify', row) },
                      { label: 'Call History', icon: <Phone />, action: 'history', onClick: () => onRowAction?.('history', row) },
                      { label: 'Remove Assignment', icon: <Trash2 />, action: 'remove', variant: 'destructive', onClick: () => onRowAction?.('remove', row) },
                    ]}
                  />
                </td>

                {/* Live Status */}
                <td style={{ padding: '12px 16px' }}>
                  <StatusBadge 
                    status={row.status || 'offline'} 
                    idleMinutes={row.idleMinutes}
                    config={STATUS_CONFIG}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

export default TelecallerTable;