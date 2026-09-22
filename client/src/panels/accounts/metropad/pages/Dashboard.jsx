import React, { useState, useRef } from 'react';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as stockService from '../services/stock.service.js';
import { getErrorMessage, formatDateShort, formatNumber } from '../utils/formatters.js';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import ErrorState from '../components/ErrorState.jsx';
import MonthlyData from './MonthlyData.jsx';
import UsersDrawer from '../components/UsersDrawer.jsx';
import {
  SoapDispenserDroplet,
  TrainFront,
  MapPin,
  CheckCircle2,
  Droplets,
  Boxes,
  ShieldCheck,
  Sparkles,
  Heart,
  Activity,
  ChevronRight,
  EllipsisVertical,
  Users as UsersIcon,
} from 'lucide-react';

function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const monthlyRef = useRef(null);
  const [usersOpen, setUsersOpen] = useState(false);

  const { data: overview, loading: dashLoading, error: dashError, refetch: refetchDashboard } = useApi(
    () => dashboardService.getOverview({}),
    []
  );

  const stats = overview?.stats ?? null;
  const refillsData = overview?.refills ?? null;
  const refillsLoading = dashLoading;

  const activePercentage = stats?.activePercentage ?? 0;

  const refillsColumns = [
    { key: '_index', label: '#', width: 36, render: (_v, _r, idx) => <span className="cell-muted">{(idx ?? 0) + 1}</span> },
    {
      key: 'refill_date',
      label: 'Date',
      width: 104,
      render: (val) => <span className="cell-strong no-wrap">{formatDateShort(val)}</span>,
    },
    { key: 'station_name', label: 'Station' },
    { key: 'refill_quantity', label: 'Refilled', width: 96, render: (val) => <span className="cell-tag refill">{val}</span> },
    { key: 'cash_collected', label: 'Cash', width: 104, render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span> },
    { key: 'refilled_by', label: 'Staff' },
    {
      key: '_actions',
      label: '',
      width: 44,
      render: () => (
        <button type="button" className="row-menu" aria-label="Row actions">
          <EllipsisVertical size={15} strokeWidth={2} />
        </button>
      ),
    },
  ];

  const kpiCards = [
    { title: 'Total Metro Lines', value: stats?.totalMetroLines ?? 0, icon: <TrainFront size={20} strokeWidth={1.9} />, color: 'blue', subtitle: 'Metro lines' },
    { title: 'Total Stations', value: stats?.totalStations ?? 0, icon: <MapPin size={20} strokeWidth={1.9} />, color: 'lavender', subtitle: 'Stations' },
    { title: 'Active Machines', value: stats?.activeMachines ?? 0, icon: <CheckCircle2 size={20} strokeWidth={1.9} />, color: 'mint', subtitle: `${activePercentage}% active` },
    { title: 'Pads Refilled This Month', value: stats?.padsRefilledThisMonth ?? 0, icon: <Droplets size={20} strokeWidth={1.9} />, color: 'pink', subtitle: 'Refilled' },
  ];

  const scrollToMonthly = (e) => {
    if (e) e.preventDefault();
    monthlyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (dashError) {
    const msg = getErrorMessage(dashError);
    return (
      <div className="metropad-page">
        <div className="metropad-content">
          <div className="error-card">
            <ErrorState message={msg} onRetry={refetchDashboard} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="metropad-page">
      <div className="metropad-content">
        {/* HERO */}
        <section className="hero-card">
          <div className="hero-inner">
            <div className="hero-icon">
              <SoapDispenserDroplet size={28} strokeWidth={1.7} />
            </div>
            <div className="hero-text">
              <div className="hero-eyebrow">MetroPad Care</div>
              <h1 className="hero-title">Sanitary Pad Machine Management</h1>
              <p className="hero-subtitle">Mumbai Metro Station Machine Monitoring & Refill Management</p>
              <div className="hero-tags">
                <span className="hero-tag safe"><ShieldCheck size={12} strokeWidth={2} /> Safe</span>
                <span className="hero-tag clean"><Sparkles size={12} strokeWidth={2} /> Clean</span>
                <span className="hero-tag dignity"><Heart size={12} strokeWidth={2} /> Dignified</span>
              </div>
              {isAdmin && (
                <div className="hero-cta">
                  <button className="btn btn-primary" onClick={() => setUsersOpen(true)}>
                    <UsersIcon size={15} strokeWidth={2} /> Add User
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <svg width="150" height="150" viewBox="0 0 150 150" fill="none">
              <circle cx="75" cy="84" r="64" fill="#EAF3FC" />
              <rect x="46" y="12" width="58" height="112" rx="12" fill="#FFFFFF" stroke="#C4DCF5" strokeWidth="1.5" />
              <rect x="55" y="22" width="40" height="32" rx="7" fill="#EFF6FE" />
              <rect x="61" y="29" width="28" height="6" rx="3" fill="#9CC3EB" />
              <circle cx="66" cy="45" r="3" fill="#2F86D9" opacity="0.9" />
              <circle cx="75" cy="45" r="3" fill="#2F86D9" opacity="0.55" />
              <circle cx="84" cy="45" r="3" fill="#2F86D9" opacity="0.3" />
              <circle cx="64" cy="66" r="4" fill="#2F86D9" opacity="0.9" />
              <circle cx="75" cy="66" r="4" fill="#2F86D9" opacity="0.5" />
              <circle cx="86" cy="66" r="4" fill="#2F86D9" opacity="0.25" />
              <rect x="57" y="84" width="36" height="14" rx="7" fill="#F1F6FC" stroke="#D6E6F7" strokeWidth="1" />
              <ellipse cx="75" cy="91" rx="10" ry="5" fill="#FDEBF1" stroke="#F2C9D7" strokeWidth="1" />
              <rect x="51" y="112" width="48" height="7" rx="3.5" fill="#E3EDF9" />
              <circle cx="119" cy="26" r="6" fill="#DFF2E8" stroke="#BBDDCD" strokeWidth="1.5" />
              <circle cx="28" cy="46" r="5" fill="#FBEAF0" stroke="#F3CDDA" strokeWidth="1.5" />
            </svg>
          </div>
        </section>

        {/* KPI GRID */}
        <section className="kpi-grid">
          {kpiCards.map((card) => (
            <KpiCard key={card.title} {...card} />
          ))}
        </section>

        {/* PAD STOCK SUMMARY */}
        <StockSummaryStrip isAdmin={isAdmin} />

        {/* RECENT REFILLS */}
        <section className="section-card">
          <header className="section-header">
            <div className="section-heading">
              <span className="section-heading-icon mint">
                <Activity size={16} strokeWidth={2} />
              </span>
              <div>
                <h2 className="section-title">Recent Refills</h2>
                <p className="section-subtitle">Latest refill activity across stations</p>
              </div>
            </div>
            {!refillsLoading && (refillsData?.refills?.length ?? 0) > 0 && (
              <div className="section-actions">
                <a className="view-all" href="#monthly-data" onClick={scrollToMonthly}>
                  View All <ChevronRight size={15} strokeWidth={2.2} />
                </a>
              </div>
            )}
          </header>
          <DataTable
            columns={refillsColumns}
            data={refillsData?.refills ?? []}
            loading={refillsLoading}
            emptyMessage="No refill activity yet"
            skeletonRows={4}
          />
        </section>

        {/* MONTHLY DATA */}
        <div className="monthly-anchor" ref={monthlyRef}>
          <MonthlyData />
        </div>
      </div>

      <UsersDrawer isOpen={usersOpen} onClose={() => setUsersOpen(false)} />
    </div>
  );
}

function StockSummaryStripSkeleton() {
  return (
    <section className="section-card">
      <div className="section-header">
        <div className="section-heading">
          <span className="section-heading-icon blue">
            <Boxes size={16} strokeWidth={2} />
          </span>
          <div>
            <h2 className="section-title">Pad Stock Summary</h2>
            <p className="section-subtitle">Central warehouse and machine-level stock</p>
          </div>
        </div>
      </div>
      <div className="stock-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="skeleton stock-tile-sk" key={i} />
        ))}
      </div>
    </section>
  );
}

function StockSummaryStrip({ isAdmin }) {
  const { addToast } = useToast();
  const { hasRole } = useAuth();
  const admin = hasRole('ADMIN');
  const showAdminActions = isAdmin || admin;
  const [configOpen, setConfigOpen] = useState(false);
  const [addQty, setAddQty] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: stock, loading, refetch: refetchStock } = useApi(() => stockService.getSummary(), []);

  if (loading) return <StockSummaryStripSkeleton />;

  const items = [
    { label: 'Initial Stock', value: stock ? `${formatNumber(stock.initialStock)} pads` : '—', tone: 'blue' },
    { label: 'Distributed', value: stock ? `${formatNumber(stock.totalDistributed)} pads` : '—', tone: 'lavender' },
    { label: 'Remaining Central Stock', value: stock ? `${formatNumber(stock.remainingCentral)} pads` : '—', tone: 'mint' },
    { label: 'Price / Pad', value: stock ? `₹${formatNumber(stock.pricePerPad)}` : '—', tone: 'amber' },
    { label: 'Remaining Stock Value', value: stock ? `₹${formatNumber(stock.remainingCentralValue)}` : '—', tone: 'pink' },
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
    <section className="section-card stock-card">
      <header className="section-header">
        <div className="section-heading">
          <span className="section-heading-icon blue">
            <Boxes size={16} strokeWidth={2} />
          </span>
          <div>
            <h2 className="section-title">Pad Stock Summary</h2>
            <p className="section-subtitle">Central warehouse and machine-level stock</p>
          </div>
        </div>
        {showAdminActions && (
          <div className="section-actions">
            <button className="btn btn-outline" onClick={openConfig}>
              + Add Pads / Set Price
            </button>
          </div>
        )}
      </header>
      <div className="stock-grid">
        {items.map((it) => (
          <div className={`stock-tile tone-${it.tone}`} key={it.label}>
            <span className="stock-tile-label">{it.label}</span>
            <span className="stock-tile-value">{it.value}</span>
          </div>
        ))}
      </div>

      <Modal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Add Pad Stock & Price"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setConfigOpen(false)}>Cancel</button>
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