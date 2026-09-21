import React, { useState, useCallback, useMemo, useEffect } from 'react';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as stockService from '../services/stock.service.js';
import { getErrorMessage, formatDateTime, formatDateShort, formatNumber } from '../utils/formatters.js';
import KpiCard from '../components/KpiCard.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import MonthlyData from './MonthlyData.jsx';
import Reports from './Reports.jsx';
import Users from './Users.jsx';
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
  ShieldCheck,
  Sparkles,
  Activity,
} from 'lucide-react';

function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [status, setStatus] = useState('');

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
  const refillsData = overview?.refills ?? null;
  const refillsLoading = dashLoading;
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
  const isLive = !dashLoading && !dashError;
  const lastUpdated = refillsData?.refills?.[0]?.refill_date || null;

  const refillsColumns = [
    {
      key: 'refill_date',
      label: 'Date',
      render: (val) => <span className="cell-strong">{formatDateShort(val)}</span>,
    },
    { key: 'station_name', label: 'Station' },
    { key: 'refill_quantity', label: 'Refilled', render: (val) => <span className="cell-tag refill">{val}</span> },
    {
      key: 'cash_collected',
      label: 'Cash',
      render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span>,
    },
    { key: 'refilled_by', label: 'Staff' },
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

      {/* MONTHLY DATA */}
      <section className="dash-section">
        <MonthlyData />
      </section>

      {/* REPORTS */}
      <section className="dash-section">
        <Reports />
      </section>

      {/* USERS (ADMIN) */}
      {isAdmin && (
        <section className="dash-section">
          <Users />
        </section>
      )}
    </div>
  );
}

function StockSummaryStrip() {
  const { addToast } = useToast();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [configOpen, setConfigOpen] = useState(false);
  const [addQty, setAddQty] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: stock, loading, refetch: refetchStock } = useApi(() => stockService.getSummary(), []);

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

  const openConfig = () => {
    setAddQty('');
    setPrice(String(stock?.pricePerPad ?? ''));
    setConfigOpen(true);
  };

  const handleSaveConfig = async () => {
    const qty = Number(addQty) || 0;
    const p = Number(price);
    if (qty < 0) {
      addToast('Pads to add must be 0 or more', 'error');
      return;
    }
    if (isNaN(p) || p < 0) {
      addToast('Price per pad must be a non-negative number', 'error');
      return;
    }
    setSaving(true);
    try {
      await stockService.updateConfig({
        initialStock: (Number(stock?.initialStock) || 0) + qty,
        pricePerPad: p,
      });
      addToast('Stock & price updated', 'success');
      setConfigOpen(false);
      refetchStock();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

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
        {isAdmin && (
          <div className="dash-card-actions">
            <button className="btn btn-outline" onClick={openConfig}>
              + Add Pads / Set Price
            </button>
          </div>
        )}
      </header>
      <div className="stock-summary-grid">
        {items.map((it) => (
          <div className="stock-summary-item" key={it.label}>
            <span className="stock-summary-label">{it.label}</span>
            <span className="stock-summary-value">{it.value}</span>
          </div>
        ))}
      </div>

      <Modal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Add Pad Stock & Price"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfigOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveConfig} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Current Central Stock</label>
            <input className="form-input" readOnly value={`${formatNumber(stock?.initialStock ?? 0)} pads`} />
          </div>
          <div className="form-group">
            <label className="form-label">Pads to Add</label>
            <input
              type="number"
              min="0"
              step="1"
              className="form-input"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              placeholder="e.g. 500"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Price per Pad (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 5"
            />
          </div>
        </div>
      </Modal>
    </section>
  );
}

export default Dashboard;