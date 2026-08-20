import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, Phone, PhoneCall, Heart, DollarSign, Target,
  TrendingUp, TrendingDown, AlertTriangle, Clock,
  UserCheck, UserX, UserMinus, Activity, BarChart3,
  ArrowUpRight, ArrowDownRight, Filter, Search,
  ChevronDown, ChevronRight, MoreVertical, Download,
  RefreshCw, Calendar, UserPlus, ArrowLeftRight,
  CheckCircle2, XCircle, AlertCircle, Bell,
  Eye, Edit, Trash2, Mail, Phone as PhoneIcon, MapPin,
  Trophy, Medal, Flag, Zap, Shield, Building2, Building,
  Download as DownloadIcon, RefreshCw as RefreshIcon,
  Coffee,
} from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { apiGet, apiPut } from '../api/auth';
import { SkeletonDashboard } from '../../../components/Skeleton';
import { useCombinedTLDashboard } from '../hooks/useTLDashboard';
import { KPICard } from '../components/KPICard';
import { DonationFunnel } from '../components/DonationFunnel';
import { HourlyPerformanceChart } from '../components/HourlyPerformanceChart';
import { TopBottomPerformers } from '../components/TopBottomPerformers';
import { TelecallerTable } from '../components/TelecallerTable';
import { FollowupManager } from '../components/FollowupManager';
import { IdleAlertBanner } from '../components/IdleAlertBanner';
import { AssignedDataView } from '../components/AssignedDataView';
import { StatusBadge } from '../components/StatusBadge';

const STATUS_CONFIG = {
  calling: { icon: <Activity className="w-3 h-3 animate-pulse" />, label: 'Calling', color: '#16a34a', bg: '#dcfce7' },
  idle: { icon: <Clock className="w-3 h-3" />, label: 'Idle', color: '#f59e0b', bg: '#fffbeb', alert: true },
  offline: { icon: <UserX className="w-3 h-3" />, label: 'Offline', color: '#9ca3af', bg: '#f3f4f6' },
  break: { icon: <Coffee className="w-3 h-3" />, label: 'Break', color: '#3b82f6', bg: '#eff6ff' },
};

const formatCurrency = (val) => val != null ? '₹' + Number(val).toLocaleString('en-IN') : '—';

export default function Dashboard() {
  const [selectedNgoId, setSelectedNgoId] = useState('all');
  const [accessibleNgos, setAccessibleNgos] = useState([]);
  const [showAssignedData, setShowAssignedData] = useState(false);
  const [assignedDataPeriod, setAssignedDataPeriod] = useState('month');
  const [assignedDataFrom, setAssignedDataFrom] = useState('');
  const [assignedDataTo, setAssignedDataTo] = useState('');
  const [dashboardPeriod, setDashboardPeriod] = useState('today');
  const [dashboardFrom, setDashboardFrom] = useState('');
  const [dashboardTo, setDashboardTo] = useState('');
  const [weakPeriod, setWeakPeriod] = useState('today');
  const [weakPerformers, setWeakPerformers] = useState([]);
  const [weakLoading, setWeakLoading] = useState(false);
  const [showAllLowPerformers, setShowAllLowPerformers] = useState(false);
  const [callAnalytics, setCallAnalytics] = useState(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  // Fetch accessible NGOs
  useEffect(() => {
    let cancelled = false;
    apiGet('/ngo-admin/ngos').then(data => { if (!cancelled) setAccessibleNgos(data); }).catch((err) => { console.error('API error:', err.message); });
    return () => { cancelled = true };
  }, []);

  // Fetch weak performers
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

  // Fetch call analytics
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

  // Use the combined dashboard hook
  const {
    dashboard,
    funnel,
    hourly,
    followups,
    assigned,
    top,
    bottom,
    idle,
    loading,
    error,
    refresh,
  } = useCombinedTLDashboard(selectedNgoId, accessibleNgos, {
    from: dashboardPeriod === 'today' ? todayStr : dashboardPeriod === 'month' ? monthStart : dashboardFrom,
    to: dashboardPeriod === 'today' ? todayStr : dashboardPeriod === 'month' ? monthEnd : dashboardTo,
  });

  // Handle assigned data fetch
  const [assignedDataLoading, setAssignedDataLoading] = useState(false);
  
  const fetchAssignedData = useCallback(async () => {
    if (!showAssignedData) return;
    setAssignedDataLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedNgoId !== 'all') params.set('ngo_id', selectedNgoId);
      params.set('period', assignedDataPeriod);
      if (assignedDataPeriod === 'custom') {
        if (assignedDataFrom) params.set('from', assignedDataFrom);
        if (assignedDataTo) params.set('to', assignedDataTo);
      }
      const res = await apiGet(`/ngo-admin/assigned-data?${params}`);
      // The hook will handle this separately
    } catch (err) {
      console.error('Assigned data fetch error:', err.message);
    } finally {
      setAssignedDataLoading(false);
    }
  }, [selectedNgoId, assignedDataPeriod, assignedDataFrom, assignedDataTo]);

  useEffect(() => {
    fetchAssignedData();
  }, [fetchAssignedData, showAssignedData]);

  // Polling for live status (replaces useRealtime)
  usePolling(
    () => apiGet('/ngo-admin/fro-status'),
    10000,
    {
      enabled: !loading,
      onSuccess: () => refresh(),
      onError: (err) => console.error('FRO status polling error:', err.message),
    }
  );

  if (loading) return <SkeletonDashboard />;
  if (error || !dashboard) {
    return (
      <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{ marginBottom: 6, fontWeight: 600, color: 'var(--ink)' }}>Could not load dashboard data</p>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>{error || 'The server took too long to respond. Please try again.'}</p>
        <button className="btn btn-primary" onClick={refresh} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Retry
        </button>
      </div>
    );
  }

  // Extract data from dashboard response
  const kpis = dashboard.kpis || {};
  const funnelData = funnel || [];
  const hourlyData = hourly || [];
  const topPerformers = top || { amount: [], donors: [], conversion: [] };
  const bottomPerformers = bottom || { target: [] };
  const idleAlerts = idle || [];

  const kpiCards = [
    { icon: Users, iconBg: 'bg-blue-50', label: 'Total Telecallers', value: kpis.total_fros || 0, color: 'text-blue-600' },
    { icon: Activity, iconBg: 'bg-green-50', label: 'Currently Calling', value: kpis.calling || 0, color: 'text-green-600' },
    { icon: Clock, iconBg: 'bg-amber-50', label: 'Idle', value: kpis.idle || 0, color: 'text-amber-600' },
    { icon: UserX, iconBg: 'bg-red-50', label: 'Offline', value: kpis.offline || 0, color: 'text-red-600' },
    { icon: Phone, iconBg: 'bg-purple-50', label: 'Total Calls', value: kpis.total_calls || 0, color: 'text-purple-600' },
    { icon: PhoneCall, iconBg: 'bg-cyan-50', label: 'Connected', value: kpis.connected || 0, color: 'text-cyan-600' },
    { icon: Heart, iconBg: 'bg-pink-50', label: 'Interested', value: kpis.interested || 0, color: 'text-pink-600' },
    { icon: DollarSign, iconBg: 'bg-green-50', label: 'Received', value: formatCurrency(kpis.received_amount), isCurrency: true, color: 'text-green-600' },
    { icon: Calendar, iconBg: 'bg-orange-50', label: 'Follow-ups Due', value: kpis.followups_due || 0, color: 'text-orange-600' },
    { icon: Target, iconBg: 'bg-indigo-50', label: 'Target Achievement', value: `${kpis.target_pct || 0}%`, color: 'text-indigo-600' },
  ];

  // Build telecaller list from performance data
  const telecallers = useMemo(() => {
    if (!dashboard.performance) return [];
    return dashboard.performance.map(p => ({
      fro_id: p.fro_id,
      fro_name: p.fro_name,
      fro_login_id: p.login_id || '',
      calls: p.total_calls || 0,
      connected: p.connected_calls || 0,
      interested: p.interested_calls || 0,
      receivedDonors: p.donations_verified || 0,
      receivedAmount: p.collected_amount || 0,
      targetPct: p.target_pct || 0,
      status: p.status || 'offline',
      idleMinutes: p.idle_minutes || 0,
      claims_pending: p.claims_pending || 0,
      claims_verified: p.claims_verified || 0,
      claims_rejected: p.claims_rejected || 0,
    }));
  }, [dashboard.performance]);

  return (
    <div>
      {/* Header Bar */}
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 width="18" height="18" style={{ color: 'var(--ink-soft)' }} />
          <select 
            value={selectedNgoId} 
            onChange={e => setSelectedNgoId(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)', minWidth: 200 }}
          >
            <option value="all">All NGOs</option>
            {accessibleNgos.map(ngo => (
              <option key={ngo.id} value={ngo.id}>{ngo.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Date Range Picker - similar to Station Performance */}
          <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 6, padding: 2, border: '1px solid var(--line)' }}>
            <button onClick={() => setDashboardPeriod('today')} style={{
              padding: '6px 12px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600,
              background: dashboardPeriod === 'today' ? 'var(--sage)' : 'transparent',
              color: dashboardPeriod === 'today' ? '#fff' : 'var(--ink-soft)', cursor: 'pointer',
            }}>Today</button>
            <button onClick={() => setDashboardPeriod('month')} style={{
              padding: '6px 12px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600,
              background: dashboardPeriod === 'month' ? 'var(--sage)' : 'transparent',
              color: dashboardPeriod === 'month' ? '#fff' : 'var(--ink-soft)', cursor: 'pointer',
            }}>Monthly</button>
            <button onClick={() => setDashboardPeriod('custom')} style={{
              padding: '6px 12px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600,
              background: dashboardPeriod === 'custom' ? 'var(--sage)' : 'transparent',
              color: dashboardPeriod === 'custom' ? '#fff' : 'var(--ink-soft)', cursor: 'pointer',
            }}>Custom</button>
          </div>

          {dashboardPeriod === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>From</span>
              <input type="date" value={dashboardFrom} onChange={e => setDashboardFrom(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }} />
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 500 }}>To</span>
              <input type="date" value={dashboardTo} onChange={e => setDashboardTo(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }} />
            </div>
          )}
          
          <button 
            onClick={refresh}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--sage)', color: '#fff', fontSize: 12, fontWeight: 600 }}
          >
            <RefreshCw width="14" height="14" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        {kpiCards.map((kpi, i) => (
          <KPICard
            key={i}
            icon={kpi.icon}
            iconBg={kpi.iconBg}
            label={kpi.label}
            value={kpi.value}
            color={kpi.color}
            isCurrency={kpi.isCurrency}
            animate={true}
          />
        ))}
      </div>

      {/* Row 2: Donation Funnel + Hourly Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <DonationFunnel 
          data={funnelData} 
          onStageClick={(stage) => { /* filter table */ }}
          animate={true}
        />
        <HourlyPerformanceChart 
          data={hourlyData} 
          onExport={() => { /* export */ }}
          animate={true}
        />
      </div>

      {/* Row 3: Top/Bottom Performers */}
      <TopBottomPerformers 
        top={topPerformers} 
        bottom={bottomPerformers}
        animate={true}
      />

      {/* Row 4: Telecaller Performance Table */}
      <TelecallerTable
        data={telecallers}
        onRowAction={(action, row) => {
          switch (action) {
            case 'view':
              window.open(`/ngo-admin/fro/${row.fro_id}/summary`, '_blank');
              break;
            case 'reassign':
              // Open reassign modal
              break;
            case 'followup':
              // Open followup modal
              break;
            case 'verify':
              // Open verify modal
              break;
            case 'history':
              // Open history modal
              break;
            case 'remove':
              // Confirm remove
              break;
          }
        }}
        loading={loading}
      />

      {/* Row 5: Follow-up Management */}
      <FollowupManager
        data={followups}
        onReassign={(assignmentId, newFroId, newDate) => {
          apiPut(`/ngo-admin/followups/${assignmentId}/reassign`, { new_fro_worker_id: newFroId, new_followup_date: newDate });
        }}
        onDateChange={(assignmentId, newDate) => {
          apiPut(`/ngo-admin/followups/${assignmentId}/date`, { followup_date: newDate });
        }}
        availableFROs={telecallers.map(t => ({ id: t.fro_id, name: t.fro_name }))}
        loading={loading}
      />

      {/* Row 6: Assigned Data - Station Performance */}
      {showAssignedData && (
        <AssignedDataView
          data={assigned}
          summary={assigned?.summary}
          selectedNgoId={selectedNgoId}
          accessibleNgos={accessibleNgos}
          onNgoChange={setSelectedNgoId}
          onExport={() => { /* export */ }}
          loading={assignedDataLoading}
        />
      )}

      {/* Idle Alert Banner */}
      <IdleAlertBanner
        alerts={idleAlerts}
        onView={(froId) => window.open(`/ngo-admin/fro-status?fro_id=${froId}`, '_blank')}
        onDismiss={(froId) => { /* dismiss */ }}
        autoHide={30000}
      />

      {/* Weak Performers Section (existing) */}
      {weakPerformers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M12 9v4m0 4h.01"/><circle cx="12" cy="12" r="10"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>Low Performers ({weakPeriod === 'today' ? 'Today' : 'This Month'})</span>
            <select value={weakPeriod} onChange={e => setWeakPeriod(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12 }}>
              <option value="today">Today</option>
              <option value="month">Month</option>
            </select>
            <button onClick={() => setShowAllLowPerformers(!showAllLowPerformers)} style={{ marginLeft: 'auto', padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 6, background: 'transparent', fontSize: 11 }}>
              {showAllLowPerformers ? 'Show Less' : `Show All (${weakPerformers.length})`}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>#</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>FRO</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>Collection</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>Talk Time</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>Leads</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>Data Used</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>Att. %</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: 'var(--ink-soft)', fontSize: 10, textTransform: 'uppercase' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {weakPerformers.slice(0, showAllLowPerformers ? weakPerformers.length : 10).map((p, i) => (
                  <tr key={p.fro_id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px', color: 'var(--ink-soft)', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: '10px', fontWeight: 600 }}>{p.fro_name}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>₹{p.collection_amount.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontSize: 11, color: 'var(--ink-soft)' }}>
                      {p.avg_talk_seconds > 0 ? `${Math.floor(p.avg_talk_seconds / 60)}m ${p.avg_talk_seconds % 60}s` : '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{p.lead_done_count}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{p.data_used}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      {p.attendance_pct != null
                        ? <span style={{ color: p.attendance_pct < 50 ? '#dc2626' : p.attendance_pct < 75 ? '#f59e0b' : '#16a34a', fontWeight: 600 }}>{p.attendance_pct}%</span>
                        : '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: p.score < 0.2 ? '#dc2626' : '#f59e0b' }}>{p.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}