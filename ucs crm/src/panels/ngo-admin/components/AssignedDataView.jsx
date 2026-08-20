import { useState, useMemo } from 'react';
import { Calendar, CalendarDays, CalendarRange, Building2, Users, Phone, CheckCircle, XCircle, TrendingUp, Download, RefreshCw, Filter, ChevronDown, MoreHorizontal, Building } from 'lucide-react';
import { Badge } from './Badge';

const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

export function AssignedDataView({ 
  data, 
  summary, 
  selectedNgoId, 
  accessibleNgos,
  onNgoChange,
  onExport,
  loading = false 
}) {
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'donors', direction: 'desc' });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedStations = useMemo(() => {
    if (!data?.stations) return [];
    return [...data.stations].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === bVal) return 0;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (typeof aVal === 'string') return aVal.localeCompare(bVal) * dir;
      return (aVal - bVal) * dir;
    });
  }, [data?.stations, sortConfig]);

  const totals = useMemo(() => ({
    stations: data?.stations?.length || 0,
    totalDonors: data?.summary?.total_donors || 0,
    totalConnected: data?.summary?.total_connected || 0,
    totalNonConnected: data?.summary?.total_non_connected || 0,
    totalLeadDone: data?.summary?.total_lead_done || 0,
    connectRate: data?.summary?.total_donors > 0 
      ? Math.round((data.summary.total_connected / data.summary.total_donors) * 1000) / 10 
      : 0,
  }), [data]);

  const handleExport = () => {
    if (!data?.stations) return;
    const headers = ['Station', 'Donors', 'Connected', 'Non-Connected', 'Lead Done', 'NGOs', 'FRO'];
    const rows = sortedStations.map(s => [
      s.station,
      s.donors,
      s.connected,
      s.non_connected,
      s.lead_done,
      s.ngos?.map(n => n.name).join(', ') || '—',
      s.fro_name || '—',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assigned-data-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExport?.();
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 48, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Header with Filters */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--line)', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 width="18" height="18" style={{ color: 'var(--ink-soft)' }} />
            <select 
              value={selectedNgoId} 
              onChange={e => onNgoChange(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }}
            >
              <option value="all">All NGOs</option>
              {accessibleNgos.map(ngo => (
                <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 6, padding: 2, border: '1px solid var(--line)' }}>
            <button onClick={() => setPeriod('today')} style={{
              padding: '6px 12px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600,
              background: period === 'today' ? 'var(--sage)' : 'transparent',
              color: period === 'today' ? '#fff' : 'var(--ink-soft)', cursor: 'pointer',
            }}>Today</button>
            <button onClick={() => setPeriod('month')} style={{
              padding: '6px 12px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600,
              background: period === 'month' ? 'var(--sage)' : 'transparent',
              color: period === 'month' ? '#fff' : 'var(--ink-soft)', cursor: 'pointer',
            }}>Monthly</button>
            <button onClick={() => setPeriod('custom')} style={{
              padding: '6px 12px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600,
              background: period === 'custom' ? 'var(--sage)' : 'transparent',
              color: period === 'custom' ? '#fff' : 'var(--ink-soft)', cursor: 'pointer',
            }}>Custom</button>
          </div>

          {period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>From</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }} />
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>To</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }} />
            </div>
          )}
          
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
              <Download width="14" height="14" />
              Export CSV
            </button>
            <button onClick={() => { /* refresh */ }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
              <RefreshCw width="14" height="14" />
              Refresh
            </button>
          </div>
        </div>

        {/* Custom date inputs when custom selected */}
        {period === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>From</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }} />
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>To</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }} />
          </div>
        )}
      </div>

      {/* Summary Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, padding: '16px', background: '#fff', borderBottom: '1px solid var(--line)' }}>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Stations</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8' }}>{totals.stations}</div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Total Donors</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>{totals.totalDonors.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Connected</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8' }}>{totals.totalConnected.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Non-Connected</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c' }}>{totals.totalNonConnected.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#ec4899', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Lead Done</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#be185d' }}>{totals.totalLeadDone.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Connect Rate</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>{totals.connectRate}%</div>
        </div>
      </div>

      {/* Stations Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {[
                { key: 'station', label: 'Station' },
                { key: 'donors', label: 'Donors', numeric: true },
                { key: 'connected', label: 'Connected', numeric: true, color: '#3b82f6' },
                { key: 'non_connected', label: 'Non Connected', numeric: true, color: '#dc2626' },
                { key: 'lead_done', label: 'Lead Done', numeric: true, color: '#ec4899' },
                { key: 'ngos', label: 'NGOs' },
                { key: 'fro_name', label: 'FRO' },
              ].map(col => (
                <th 
                  key={col.key}
                  style={{ 
                    padding: '12px 16px', 
                    textAlign: col.numeric ? 'right' : 'left',
                    fontWeight: 600,
                    color: 'var(--ink-soft)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontSize: 10,
                    borderBottom: '1px solid var(--line)',
                    cursor: col.key !== 'ngos' && col.key !== 'fro_name' ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onClick={() => col.key !== 'ngos' && col.key !== 'fro_name' && handleSort(col.key)}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {sortConfig.key === col.key && (
                      sortConfig.direction === 'asc' ? '↑' : '↓'
                    )}
                  </div>
                </th>
              ))}
            </tr>
</thead>
          <tbody>
            {(() => {
              if (sortedStations.length === 0) {
                return (
                  <tr>
                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                      No station data available
                    </td>
                  </tr>
                );
              }
              return sortedStations.map((station, index) => (
                <tr key={station.station} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{station.station}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {station.donors}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#3b82f6' }}>
                    {station.connected}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>
                    {station.non_connected}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#ec4899' }}>
                    {station.lead_done}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--ink-soft)' }}>
                    {station.ngos?.map(n => (
                      <Badge key={n.id} variant="info" size="sm" style={{ marginRight: 4 }}>{n.name}</Badge>
                    )) || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink)' }}>{station.fro_name || 'Unassigned'}</td>
                </tr>
              ));
            })()}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
              <td style={{ padding: '12px 16px' }}>TOTAL</td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>{totals.totalDonors.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#3b82f6' }}>{totals.totalConnected.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#dc2626' }}>{totals.totalNonConnected.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ec4899' }}>{totals.totalLeadDone.toLocaleString('en-IN')}</td>
              <td style={{ padding: '12px 16px' }}>{totals.stations}</td>
              <td style={{ padding: '12px 16px' }}>—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

export default AssignedDataView;