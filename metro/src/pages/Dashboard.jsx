import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import useApi from '../hooks/useApi.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as stockService from '../services/stock.service.js';
import { getErrorMessage, formatDateTime, getStockLevel, formatNumber } from '../utils/formatters.js';
import { MACHINE_CAPACITY } from '../utils/constants.js';
import { metroLines, metroStations, DISPLAY_LINE_IDS } from '../data/mumbaiMetro.js';
import KpiCard from '../components/KpiCard.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import LineFilter from '../components/Map/LineFilter.jsx';
import {
  SoapDispenserDroplet,
  TrainFront,
  MapPin,
  Cpu,
  CheckCircle2,
  Power,
  Boxes,
  Wrench,
  Droplets,
  BellRing,
  RefreshCw,
  AlertTriangle,
  FileBarChart,
  ArrowRight,
  Eye,
  X,
  ShieldCheck,
  Sparkles,
  Zap,
  ChevronRight,
  Map,
  Activity,
} from 'lucide-react';

const MAP_BOUNDS = [
  [18.9, 72.78],
  [19.3, 72.97],
];

const lineCoordinates = metroLines
  .filter((line) => DISPLAY_LINE_IDS.includes(line.id))
  .map((line) => ({
  ...line,
  positions: line.stations
    .map((id) => {
      const s = metroStations[id];
      return s ? [s.lat, s.lng] : null;
    })
    .filter(Boolean),
}));

const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const STATION_STATUS_META = {
  critical: { color: '#ef4444', radius: 7, label: 'Critical' },
  low: { color: '#f59e0b', radius: 6, label: 'Low' },
  maintenance: { color: '#8b5cf6', radius: 6, label: 'Maintenance' },
  inactive: { color: '#94a3b8', radius: 5, label: 'Inactive' },
  normal: { color: '#10b981', radius: 5, label: 'Normal' },
  none: { color: '#ffffff', radius: 4, label: 'No Data' },
};

function MetroMap({ activeLineId, fullscreen = false, stationStatus = {} }) {
  const shownLines = activeLineId ? lineCoordinates.filter((l) => l.id === activeLineId) : lineCoordinates;
  const shownStationIds = useMemo(() => {
    const ids = new Set();
    shownLines.forEach((l) => l.stations.forEach((id) => ids.add(id)));
    return ids;
  }, [shownLines, activeLineId]);

  const stations = Object.values(metroStations).filter((s) => shownStationIds.has(s.id));

  return (
    <MapContainer
      bounds={MAP_BOUNDS}
      className={`dash-map${fullscreen ? ' fullscreen' : ''}`}
      scrollWheelZoom={fullscreen}
      dragging={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {shownLines.map((line) => (
        <Polyline
          key={line.id}
          positions={line.positions}
          pathOptions={{ color: line.color, weight: fullscreen ? 4 : 3, opacity: 0.9 }}
        />
      ))}
      {stations.map((s) => {
        const meta = stationStatus[s.id] || STATION_STATUS_META.none;
        const pulsing = meta.color === '#ef4444' || meta.color === '#f59e0b';
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={fullscreen ? meta.radius + 1 : meta.radius}
            pathOptions={{
              color: meta.color,
              fillColor: meta.color,
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            <Tooltip>
              <strong>{s.name}</strong>
              {meta.label !== 'No Data' && <div>Status: {meta.label}</div>}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

function StockLevel({ currentStock, lowStockThreshold }) {
  const level = getStockLevel(Number(currentStock) || 0, Number(lowStockThreshold) || 0);
  return <StatusBadge status={level} size="sm" />;
}

function Dashboard() {
  const navigate = useNavigate();

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [status, setStatus] = useState('');
  const [activeLineId, setActiveLineId] = useState(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const filters = useMemo(() => {
    const p = {};
    if (lineId) p.lineId = lineId;
    if (stationId) p.stationId = stationId;
    if (status) p.status = status;
    return p;
  }, [lineId, stationId, status]);

  const filterKey = JSON.stringify(filters);

  const { data: linesData, loading: linesLoading } = useApi(
    () => metroLineService.getAll({ limit: 100 }),
    []
  );

  const lineOptions = useMemo(() => {
    const lines = linesData?.lines || [];
    return lines.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));
  }, [linesData]);

  const { data: stationsData, loading: stationsLoading } = useApi(
    () => (lineId ? stationService.getAll({ lineId, limit: 200 }) : Promise.resolve(null)),
    [lineId]
  );

  const stationOptions = useMemo(() => {
    if (!stationsData?.stations) return [];
    return stationsData.stations.map((s) => ({
      value: s.id,
      label: s.name,
    }));
  }, [stationsData]);

  const { data: overview, loading: dashLoading, error: dashError, refetch: refetchDashboard } = useApi(
    () => dashboardService.getOverview(filters),
    [filterKey]
  );

  const stats = overview?.stats ?? null;
  const lowStockData = overview?.lowStock ?? null;
  const attentionData = overview?.attention ?? null;
  const lowStockMachines = Array.isArray(lowStockData?.machines) ? lowStockData.machines : [];
  const attentionMachines = Array.isArray(attentionData?.machines) ? attentionData.machines : [];
  const refillsData = overview?.refills ?? null;
  const statsLoading = dashLoading;
  const lowStockLoading = dashLoading;
  const attentionLoading = dashLoading;
  const refillsLoading = dashLoading;
  const statsError = dashError;
  const lowStockError = dashError;
  const attentionError = dashError;
  const refillsError = dashError;

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'lineId') {
      setLineId(value);
      setStationId('');
    } else if (key === 'stationId') {
      setStationId(value);
    } else if (key === 'status') {
      setStatus(value);
    }
  }, []);

  const handleClearFilters = useCallback(() => {
    setLineId('');
    setStationId('');
    setStatus('');
  }, []);

  useEffect(() => {
    if (mapModalOpen) {
      const onKey = (e) => { if (e.key === 'Escape') setMapModalOpen(false); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [mapModalOpen]);

  const dashboardFilters = [
    { key: 'lineId', type: 'select', value: lineId, label: 'All Metro Lines', options: lineOptions },
    { key: 'stationId', type: 'select', value: stationId, label: 'All Stations', options: stationOptions },
    {
      key: 'status',
      type: 'select',
      value: status,
      label: 'All Statuses',
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' },
        { value: 'OFFLINE', label: 'Offline' },
        { value: 'MAINTENANCE', label: 'Maintenance' },
      ],
    },
  ];

  const activePercentage = stats?.activePercentage ?? 0;
  const isLive = !statsLoading && !statsError;
  const lastUpdated = refillsData?.refills?.[0]?.refill_date || null;

  const machineLink = (row) => `/machines/${row.machine_id || row.id}`;

  /* Build per-station status from live machine data for the map markers */
  const stationStatus = useMemo(() => {
    const statusMap = {};
    const lowStockMachines = Array.isArray(lowStockData?.machines) ? lowStockData.machines : [];
    const attentionMachines = Array.isArray(attentionData?.machines) ? attentionData.machines : [];
    const allMachines = [...lowStockMachines, ...attentionMachines];
    const byName = {};
    allMachines.forEach((m) => {
      const key = normalize(m.station_name) || m.station_id;
      if (!byName[key]) byName[key] = { stationId: m.station_id, machines: [] };
      byName[key].machines.push(m);
    });

    Object.keys(byName).forEach((stationName) => {
      const aggregate = byName[stationName];
      let critical = false;
      let low = false;
      let maintenance = false;
      let inactive = false;
      aggregate.machines.forEach((m) => {
        if (Number(m.current_stock) <= 0) critical = true;
        else if (Number(m.stock_percentage) <= 30) low = true;
        if (['MAINTENANCE', 'OFFLINE'].includes(m.status)) maintenance = true;
        if (m.status === 'INACTIVE') inactive = true;
      });

      let meta;
      if (critical) meta = STATION_STATUS_META.critical;
      else if (maintenance) meta = STATION_STATUS_META.maintenance;
      else if (inactive) meta = STATION_STATUS_META.inactive;
      else if (low) meta = STATION_STATUS_META.low;
      else meta = STATION_STATUS_META.normal;

      const staticStation = Object.values(metroStations).find((st) => {
        if (normalize(st.name) === stationName) return true;
        return (st.aliases || []).some((a) => normalize(a) === stationName);
      });

      if (staticStation) {
        statusMap[staticStation.id] = meta;
      }
    });

    return statusMap;
  }, [lowStockData, attentionData]);

  const lowStockColumns = [
    { key: 'station_name', label: 'Station' },
    {
      key: 'machine_id',
      label: 'Machine ID',
      width: '150px',
      render: (val, row) => <Link to={machineLink(row)} onClick={(e) => e.stopPropagation()}>{val || row.machine_code}</Link>,
    },
    {
      key: 'stock',
      label: 'Stock',
      render: (_, row) => {
        const pct = Math.min(100, Math.max(0, Number(row.stock_percentage) || 0));
        const tone = pct <= 30 ? 'danger' : pct <= 60 ? 'warning' : 'success';
        return (
          <div className="stock-bar-cell">
            <div className={`stock-bar ${tone}`}>
              <div className="stock-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className={`stock-bar-value ${tone}`}>
              {(row.current_stock ?? 0)} of {row.capacity ?? MACHINE_CAPACITY}
            </span>
          </div>
        );
      },
    },
    {
      key: 'last_refill_at',
      label: 'Last Refill',
      render: (val) => <span className="cell-muted">{formatDateTime(val) || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => (
        <span className="status-cell">
          <span className="stock-level-pill low">Low Stock</span>
          <StatusBadge status={val} size="sm" />
        </span>
      ),
    },
    {
      key: 'view',
      label: 'Action',
      render: (_, row) => (
        <Link className="btn btn-soft btn-sm" to={machineLink(row)} onClick={(e) => e.stopPropagation()}>
          <Eye size={14} strokeWidth={2} /> View
        </Link>
      ),
    },
  ];

  const attentionColumns = [
    { key: 'station_name', label: 'Station' },
    {
      key: 'machine_id',
      label: 'Machine ID',
      width: '150px',
      render: (val, row) => <Link to={machineLink(row)} onClick={(e) => e.stopPropagation()}>{val || row.machine_code}</Link>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => (
        <span className="status-cell">
          <StatusBadge status={val} size="sm" />
          {Number(row.current_stock) === 0 && <StockLevel currentStock={row.current_stock} lowStockThreshold={row.low_stock_threshold} />}
        </span>
      ),
    },
    {
      key: 'stock',
      label: 'Stock',
      render: (_, row) => {
        const pct = Math.min(100, Math.max(0, Number(row.stock_percentage) || 0));
        const tone = pct <= 30 ? 'danger' : pct <= 60 ? 'warning' : 'success';
        return (
          <div className="stock-bar-cell">
            <div className={`stock-bar ${tone}`}>
              <div className="stock-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className={`stock-bar-value ${tone}`}>
              {(row.current_stock ?? 0)} of {row.capacity ?? MACHINE_CAPACITY}
            </span>
          </div>
        );
      },
    },
    {
      key: 'last_refill_at',
      label: 'Last Refill',
      render: (val) => <span className="cell-muted">{formatDateTime(val) || '—'}</span>,
    },
    {
      key: 'view',
      label: 'Action',
      render: (_, row) => (
        <Link className="btn btn-soft btn-sm" to={machineLink(row)} onClick={(e) => e.stopPropagation()}>
          <Eye size={14} strokeWidth={2} /> View
        </Link>
      ),
    },
  ];

  const refillsColumns = [
    {
      key: 'refill_date',
      label: 'Date',
      render: (val) => <span className="cell-strong">{formatDateTime(val)}</span>,
    },
    { key: 'station_name', label: 'Station' },
    { key: 'machine_code', label: 'Machine' },
    { key: 'previous_stock', label: 'Previous Stock', render: (val) => <span className="cell-muted">{val ?? 0}</span> },
    { key: 'refill_quantity', label: 'Refilled', render: (val) => <span className="cell-tag refill">{val}</span> },
    {
      key: 'cash_collected',
      label: 'Cash',
      render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span>,
    },
    { key: 'new_stock', label: 'Current Stock', render: (val) => <span className="cell-strong">{val ?? 0}</span> },
    { key: 'refilled_by', label: 'Staff' },
  ];

  const quickActions = [
    { to: '/refills', icon: RefreshCw, title: 'Refill Stock', desc: 'Manage refills', tone: 'blue' },
    { to: '/stock-issues', icon: AlertTriangle, title: 'Report Issue', desc: 'Machine problem', tone: 'orange' },
    { to: '/maintenance', icon: Wrench, title: 'Maintenance', desc: 'Schedule service', tone: 'purple' },
    { to: '/reports', icon: FileBarChart, title: 'View Reports', desc: 'Monthly data', tone: 'green' },
  ];

  const kpiCards = [
    { title: 'Total Metro Lines', value: stats?.totalMetroLines ?? 0, icon: <TrainFront size={20} strokeWidth={1.9} />, color: 'blue', subtitle: 'Lines' },
    { title: 'Total Stations', value: stats?.totalStations ?? 0, icon: <MapPin size={20} strokeWidth={1.9} />, color: 'purple', subtitle: 'Stations' },
    { title: 'Total Machines', value: stats?.totalMachines ?? 0, icon: <Cpu size={20} strokeWidth={1.9} />, color: 'teal', subtitle: 'Machines' },
    { title: 'Active Machines', value: stats?.activeMachines ?? 0, icon: <CheckCircle2 size={20} strokeWidth={1.9} />, color: 'green', subtitle: `${activePercentage}% active` },
    { title: 'Inactive Machines', value: stats?.inactiveMachines ?? 0, icon: <Power size={20} strokeWidth={1.9} />, color: 'red', subtitle: 'Inactive' },
    { title: 'Low Stock Machines', value: stats?.lowStockMachines ?? 0, icon: <Boxes size={20} strokeWidth={1.9} />, color: 'orange', subtitle: 'Low stock' },
    { title: 'Machines Under Maintenance', value: stats?.maintenanceMachines ?? 0, icon: <Wrench size={20} strokeWidth={1.9} />, color: 'indigo', subtitle: 'Under maintenance' },
    { title: 'Pads Refilled This Month', value: stats?.padsRefilledThisMonth ?? 0, icon: <Droplets size={20} strokeWidth={1.9} />, color: 'pink', subtitle: 'Refilled' },
  ];

  if (dashError) {
    const msg = getErrorMessage(dashError);
    return (
      <div className="dashboard-page">
        <div className="dash-error">
          <ErrorState message={msg} onRetry={refetchDashboard} />
        </div>
      </div>
    );
  }

  const mapStatusItems = [
    { label: 'Active', value: stats?.activeMachines ?? 0, tone: 'green' },
    { label: 'Low Stock', value: stats?.lowStockMachines ?? 0, tone: 'amber' },
    { label: 'Maintenance', value: stats?.maintenanceMachines ?? 0, tone: 'violet' },
    { label: 'Inactive', value: stats?.inactiveMachines ?? 0, tone: 'rose' },
  ];

  const renderMapCard = (fullscreen = false) => (
    <>
      <header className="dash-card-header">
        <div className="dash-card-title">
          <span className="dash-card-icon info"><Map size={16} strokeWidth={2} /></span>
          <div>
            <h2>Mumbai Metro Map</h2>
            <p>Network overview with live machine status</p>
          </div>
        </div>
        {!fullscreen && (
          <button className="dash-card-link" onClick={() => setMapModalOpen(true)}>
            View Full Map <ArrowRight size={14} strokeWidth={2.2} />
          </button>
        )}
        {fullscreen && (
          <button className="dash-modal-close" onClick={() => setMapModalOpen(false)} aria-label="Close map">
            <X size={18} strokeWidth={2} />
          </button>
        )}
      </header>
      <div className={`dash-map-wrap${fullscreen ? ' fullscreen' : ''}`}>
        <MetroMap activeLineId={activeLineId} fullscreen={fullscreen} stationStatus={stationStatus} />
        <div className="dash-map-legend">
          <div className="dash-map-legend-row">
            <span className="dash-map-legend-dot normal" /> Normal
          </div>
          <div className="dash-map-legend-row">
            <span className="dash-map-legend-dot low" /> Low
          </div>
          <div className="dash-map-legend-row">
            <span className="dash-map-legend-dot critical" /> Critical
          </div>
        </div>
      </div>
      <div className="dash-map-chips">
        <LineFilter activeLineId={activeLineId} onSelect={setActiveLineId} />
      </div>
      <div className="dash-map-status">
        {mapStatusItems.map((item, idx) => (
          <React.Fragment key={item.label}>
            {idx > 0 && <div className="dash-map-status-sep" />}
            <div className="dash-map-status-item">
              <span className={`dash-map-status-value ${item.tone}`}>{item.value}</span>
              <span className="dash-map-status-label">{item.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </>
  );

  return (
    <div className="dashboard-page">
      {/* HERO */}
      <section className="dash-hero">
        <div className="dash-hero-content">
          <div className="dash-hero-icon">
            <SoapDispenserDroplet size={30} strokeWidth={1.7} />
          </div>
          <div className="dash-hero-copy">
            <div className="dash-hero-eyebrow">
              <span className="dash-hero-eyebrow-dot" />
              MetroPad Care
            </div>
            <h1 className="dash-hero-title">Sanitary Pad Machine Management</h1>
            <p className="dash-hero-subtitle">Mumbai Metro Station Machine Monitoring & Refill Management</p>
            <div className="dash-hero-badges">
              <span className="dash-hero-badge"><ShieldCheck size={13} strokeWidth={2} /> Safe</span>
              <span className="dash-hero-badge"><Sparkles size={13} strokeWidth={2} /> Clean</span>
              <span className="dash-hero-badge"><Droplets size={13} strokeWidth={2} /> Dignified</span>
            </div>
          </div>
        </div>
        <div className="dash-hero-art" aria-hidden="true">
          <svg width="150" height="120" viewBox="0 0 150 120" fill="none">
            <rect x="52" y="8" width="46" height="104" rx="8" fill="#ffffff" stroke="#c7d2fe" strokeWidth="1.5" />
            <rect x="60" y="18" width="30" height="34" rx="4" fill="#eef2ff" />
            <rect x="64" y="23" width="22" height="4" rx="2" fill="#a5b4fc" />
            <rect x="64" y="30" width="22" height="4" rx="2" fill="#a5b4fc" />
            <rect x="64" y="37" width="22" height="4" rx="2" fill="#a5b4fc" />
            <rect x="64" y="44" width="22" height="4" rx="2" fill="#a5b4fc" />
            <rect x="60" y="62" width="30" height="18" rx="4" fill="#eef2ff" />
            <circle cx="66" cy="72" r="3" fill="#6366f1" opacity="0.9" />
            <circle cx="74" cy="72" r="3" fill="#6366f1" opacity="0.5" />
            <circle cx="82" cy="72" r="3" fill="#6366f1" opacity="0.25" />
            <rect x="62" y="92" width="26" height="6" rx="3" fill="#edeef3" />
            <circle cx="125" cy="18" r="5" fill="#d6edff" stroke="#7ec3ff" strokeWidth="1.5" />
            <circle cx="125" cy="18" r="2" fill="#3b82f6" />
          </svg>
        </div>
      </section>

      {/* FILTER TOOLBAR */}
      <section className="dash-toolbar">
        <FilterBar
          filters={dashboardFilters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
          loading={linesLoading || stationsLoading}
        />
        <div className="dash-live">
          <div className="dash-live-updated">
            <span className="dash-live-label">Last Updated</span>
            <strong>{lastUpdated ? formatDateTime(lastUpdated) : '—'}</strong>
          </div>
          <span className={`dash-live-pill${isLive ? '' : ' offline'}`}>
            <span className="dash-live-dot" />
            {isLive ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </section>

      {/* KPI GRID */}
      <section className="kpi-grid">
        {kpiCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </section>

      {/* PAD STOCK SUMMARY */}
      <StockSummaryStrip />

      {/* MAIN CONTENT 60/40 */}
      <div className="dash-grid">
        <div className="dash-col dash-col-main">
          {/* LOW STOCK ALERTS */}
          <section className="dash-card">
            <header className="dash-card-header">
              <div className="dash-card-title">
                <span className="dash-card-icon danger"><BellRing size={16} strokeWidth={2} /></span>
                <div>
                  <h2>Low Stock Alerts</h2>
                  <p>Machines running below threshold</p>
                </div>
              </div>
              <Link className="dash-card-link" to="/machines">
                View All <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
            </header>
            {lowStockLoading ? (
              <LoadingSpinner message="Loading low stock alerts..." />
            ) : lowStockMachines.length > 0 ? (
              <div className="table-wrapper">
                <DataTable
                  columns={lowStockColumns}
                  data={lowStockMachines}
                  emptyMessage="No low stock alerts"
                  onRowClick={(row) => navigate(machineLink(row))}
                />
              </div>
            ) : (
              <EmptyState icon="📭" message="No low stock alerts" />
            )}
          </section>

          {/* MACHINES REQUIRING ATTENTION */}
          <section className="dash-card">
            <header className="dash-card-header">
              <div className="dash-card-title">
                <span className="dash-card-icon warning"><AlertTriangle size={16} strokeWidth={2} /></span>
                <div>
                  <h2>Machines Requiring Attention</h2>
                  <p>Inactive, offline or in maintenance</p>
                </div>
              </div>
              <Link className="dash-card-link" to="/machines">
                View All <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
            </header>
            {attentionLoading ? (
              <LoadingSpinner message="Loading attention machines..." />
            ) : attentionMachines.length > 0 ? (
              <div className="table-wrapper">
                <DataTable
                  columns={attentionColumns}
                  data={attentionMachines}
                  emptyMessage="No machines requiring attention"
                  onRowClick={(row) => navigate(machineLink(row))}
                />
              </div>
            ) : (
              <EmptyState icon="✅" message="No machines requiring attention" />
            )}
          </section>
        </div>

        <div className="dash-col dash-col-side">
          {/* MUMBAI METRO MAP */}
          <section className="dash-card dash-map-card">
            {renderMapCard()}
          </section>

          {/* QUICK ACTIONS */}
          <section className="dash-card">
            <header className="dash-card-header">
              <div className="dash-card-title">
                <span className="dash-card-icon primary"><Zap size={16} strokeWidth={2} /></span>
                <div>
                  <h2>Quick Actions</h2>
                  <p>Common tasks</p>
                </div>
              </div>
            </header>
            <div className="dash-actions">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  className="dash-action"
                  onClick={() => navigate(action.to)}
                >
                  <span className={`dash-action-icon ${action.tone}`}>
                    <action.icon size={17} strokeWidth={1.9} />
                  </span>
                  <span className="dash-action-meta">
                    <strong>{action.title}</strong>
                    <small>{action.desc}</small>
                  </span>
                  <ChevronRight size={15} strokeWidth={2} className="dash-action-arrow" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* RECENT REFILLS */}
      <section className="dash-card">
        <header className="dash-card-header">
          <div className="dash-card-title">
            <span className="dash-card-icon success"><Activity size={16} strokeWidth={2} /></span>
            <div>
              <h2>Recent Refills</h2>
              <p>Latest refill activity across stations</p>
            </div>
          </div>
          <Link className="dash-card-link" to="/refills">
            View All <ArrowRight size={14} strokeWidth={2.2} />
          </Link>
        </header>
        {refillsLoading ? (
          <LoadingSpinner message="Loading recent refills..." />
        ) : (refillsData?.refills?.length ?? 0) > 0 ? (
          <div className="table-wrapper">
            <DataTable
              columns={refillsColumns}
              data={refillsData.refills}
              emptyMessage="No recent refills"
            />
          </div>
        ) : (
          <EmptyState icon="📭" message="No recent refills" />
        )}
      </section>

      {/* FULLSCREEN MAP MODAL */}
      {mapModalOpen && (
        <div className="dash-map-modal" onClick={() => setMapModalOpen(false)}>
          <div className="dash-map-modal-panel" onClick={(e) => e.stopPropagation()}>
            <section className="dash-card dash-map-card" style={{ border: 'none', boxShadow: 'none' }}>
              {renderMapCard(true)}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function StockSummaryStrip() {
  const navigate = useNavigate();
  const { data: stock, loading } = useApi(() => stockService.getSummary(), []);

  if (loading) return null;

  const items = [
    { label: 'Initial Stock', value: stock ? `${formatNumber(stock.initialStock)} pads` : '—' },
    { label: 'Distributed', value: stock ? `${formatNumber(stock.totalDistributed)} pads` : '—' },
    { label: 'Remaining Central Stock', value: stock ? `${formatNumber(stock.remainingCentral)} pads` : '—' },
    { label: 'Price / Pad', value: stock ? `₹${formatNumber(stock.pricePerPad)}` : '—' },
    { label: 'Remaining Stock Value', value: stock ? `₹${formatNumber(stock.remainingCentralValue)}` : '—' },
    { label: 'Pads Inside Machines', value: stock ? `${formatNumber(stock.totalMachinePads)} pads` : '—' },
    { label: 'Value Inside Machines', value: stock ? `₹${formatNumber(stock.totalMachineValue)}` : '—' },
  ];

  return (
    <section className="dash-card">
      <header className="dash-card-header">
        <div className="dash-card-title">
          <span className="dash-card-icon primary"><Boxes size={16} strokeWidth={2} /></span>
          <div>
            <h2>Pad Stock Summary</h2>
            <p>Central warehouse and machine-level stock</p>
          </div>
        </div>
        <Link className="dash-card-link" to="/pad-stock">
          Open Pad Stock <ArrowRight size={14} strokeWidth={2.2} />
        </Link>
      </header>
      <div className="stock-summary-grid">
        {items.map((it) => (
          <div className="stock-summary-item" key={it.label}>
            <span className="stock-summary-label">{it.label}</span>
            <span className="stock-summary-value">{it.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Dashboard;