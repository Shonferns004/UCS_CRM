import React, { useState, useMemo, useCallback } from 'react';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as machineService from '../services/machine.service.js';
import * as monthlyDataService from '../services/monthlyData.service.js';
import * as reportService from '../services/report.service.js';
import { MONTHS, MONTHLY_MACHINE_STATUSES, MONTHLY_ISSUE_TYPES } from '../utils/constants.js';
import { getErrorMessage, formatNumber, formatDate } from '../utils/formatters.js';
import FilterBar from '../components/FilterBar.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import LineBadge from '../components/LineBadge.jsx';

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const MACHINE_STATUS_LABELS = {
  WORKING: 'Working',
  NOT_WORKING: 'Not Working',
  MAINTENANCE: 'Maintenance',
  EMPTY: 'Empty',
  OTHER_ISSUE: 'Other Issue',
};

const MACHINE_STATUS_VARIANTS = {
  WORKING: 'success',
  NOT_WORKING: 'danger',
  MAINTENANCE: 'warning',
  EMPTY: 'danger',
  OTHER_ISSUE: 'warning',
};

const ISSUE_LABELS = {
  NONE: 'No Issue',
  COIN_ACCEPTOR_PROBLEM: 'Coin Accepted Problem',
  MACHINE_NOT_WORKING: 'Machine Not Working',
  DISPENSING_PROBLEM: 'Dispensing Problem',
  ELECTRICAL_PROBLEM: 'Electrical Problem',
  STOCK_PROBLEM: 'Stock Problem',
  OTHER: 'Other',
};

function issueLabel(key) {
  return ISSUE_LABELS[key] || (key || '').replace(/_/g, ' ');
}

function statusLabel(key) {
  return MACHINE_STATUS_LABELS[key] || (key || '').replace(/_/g, ' ');
}

function MonthlyData() {
  const { addToast } = useToast();
  const { hasRole } = useAuth();
  const canWrite = hasRole('ADMIN', 'OPERATIONS');

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [lineId, setLineId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState('records');

  const yearOptions = useMemo(() => {
    const opts = [];
    for (let y = currentYear; y >= 2024; y--) {
      opts.push({ value: y, label: String(y) });
    }
    return opts;
  }, []);

  const monthOptions = useMemo(() =>
    MONTHS.map((name, i) => ({ value: i + 1, label: name })),
  []);

  const filterKey = JSON.stringify({ year, month, fromDate, toDate, lineId });

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'year') setYear(Number(value) || currentYear);
    else if (key === 'month') setMonth(Number(value) || currentMonth);
    else if (key === 'fromDate') setFromDate(value);
    else if (key === 'toDate') setToDate(value);
    else if (key === 'lineId') setLineId(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setYear(currentYear);
    setMonth(currentMonth);
    setFromDate('');
    setToDate('');
    setLineId('');
  }, []);

  const { data: linesData, loading: linesLoading } = useApi(
    () => metroLineService.getAll({ page: 1, limit: 100 }),
    []
  );

  const lineOptions = useMemo(() => {
    const lines = linesData?.lines || [];
    return lines.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));
  }, [linesData]);

  const filters = [
    { key: 'year', type: 'select', value: year, label: 'Select Year', options: yearOptions },
    { key: 'month', type: 'select', value: month, label: 'Select Month', options: monthOptions },
    { key: 'fromDate', type: 'date', value: fromDate, label: 'From Date' },
    { key: 'toDate', type: 'date', value: toDate, label: 'To Date' },
    { key: 'lineId', type: 'select', value: lineId, label: 'All Metro Lines', options: lineOptions },
  ];

  const reportParams = useMemo(() => {
    const p = { year, month };
    if (fromDate) p.fromDate = fromDate;
    if (toDate) p.toDate = toDate;
    if (lineId) p.lineId = lineId;
    return p;
  }, [year, month, fromDate, toDate, lineId]);

  const { data: recordsData, loading, error, refetch } = useApi(
    () => monthlyDataService.getRecords(reportParams),
    [filterKey]
  );

  const summary = recordsData?.summary || {};
  const rows = recordsData?.rows || [];
  const stationWise = recordsData?.stationWise || [];

  const statusTotals = summary.machineStatusCounts || {};
  const issueTotals = summary.issueTypes || {};

  const statusColumns = [
    { key: 'line_name', label: 'Line', render: (val, row) => <LineBadge name={val} code={null} size="sm" /> },
    { key: 'station_name', label: 'Station', render: (val, row) => val || row.station_code || '—' },
    { key: 'station_code', label: 'Code', render: (val) => val || '—' },
    { key: 'records', label: 'Records', render: (val) => formatNumber(val ?? 0), },
    { key: 'cash_collected', label: 'Cash', render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span> },
    { key: 'pads_refilled', label: 'Pads Refilled', render: (val) => formatNumber(val ?? 0) },
    { key: 'issues', label: 'Issues', render: (val) => formatNumber(val ?? 0) },
  ];

  const recordColumns = [
    { key: 'record_date', label: 'Date', render: (val) => formatDate(val) },
    { key: 'line_name', label: 'Line', render: (val, row) => <LineBadge name={val} code={null} size="sm" /> },
    { key: 'station_name', label: 'Station', render: (val, row) => val || row.station_code || '—' },
    { key: 'machine_code', label: 'Machine', render: (val) => val || '—' },
    {
      key: 'cash_collected', label: 'Cash',
      render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span>,
    },
    { key: 'pads_refilled', label: 'Pads', render: (val) => formatNumber(val ?? 0) },
    {
      key: 'machine_status', label: 'Status',
      render: (val) => (
        <span className={`status-badge ${MACHINE_STATUS_VARIANTS[val] || 'gray'}`}>
          {statusLabel(val)}
        </span>
      ),
    },
    {
      key: 'issue_type', label: 'Issue',
      render: (val) => (val && val !== 'NONE' ? <span className="cell-warn">{issueLabel(val)}</span> : '—'),
    },
    { key: 'notes', label: 'Notes', render: (val) => val || '—' },
  ];

  const handleExport = useCallback((format) => {
    reportService
      .downloadExport('monthly', reportParams, format)
      .catch((err) => addToast(getErrorMessage(err), 'error'));
  }, [reportParams]);

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Monthly Data</h1>
            <p className="page-subtitle">Single daily record per machine — automatically updates Machines, Refills, Cash, Maintenance &amp; Issues.</p>
          </div>
        </div>
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Data</h1>
          <p className="page-subtitle">Single daily record per machine — automatically updates Machines, Refills, Cash, Maintenance &amp; Issues.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => handleExport('pdf')} disabled={loading}>
            Download PDF
          </button>
          <button className="btn btn-outline" onClick={() => handleExport('xlsx')} disabled={loading}>
            Export Excel
          </button>
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              + Add Monthly Data
            </button>
          )}
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        loading={linesLoading}
      />

      {loading ? (
        <LoadingSpinner message="Loading monthly data..." />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard title="Total Records" value={formatNumber(summary.totalRecords ?? 0)} icon="📒" color="primary" />
            <KpiCard title="Cash Collected" value={`₹${formatNumber(summary.totalCashCollected ?? 0)}`} icon="💰" color="success" />
            <KpiCard title="Pads Refilled" value={formatNumber(summary.totalPadsRefilled ?? 0)} icon="🩸" color="info" />
            <KpiCard title="Working" value={formatNumber(statusTotals.WORKING ?? 0)} icon="🟢" color="success" />
            <KpiCard title="Not Working" value={formatNumber((statusTotals.NOT_WORKING ?? 0) + (statusTotals.OTHER_ISSUE ?? 0))} icon="🔴" color="danger" />
            <KpiCard title="Maintenance" value={formatNumber(statusTotals.MAINTENANCE ?? 0)} icon="🛠️" color="warning" />
            <KpiCard title="Empty / Low Stock" value={formatNumber(statusTotals.EMPTY ?? 0)} icon="📦" color="orange" />
            <KpiCard title="Problem Records" value={formatNumber(Object.values(issueTotals).reduce((t, v) => t + v, 0))} icon="⚠️" color="danger" />
          </div>

          {rows.length === 0 ? (
            <div className="card">
              <EmptyState message="No monthly data records found for the selected filters" />
            </div>
          ) : (
            <>
              <div className="report-tabs">
                <button
                  className={`tab${tab === 'records' ? ' active' : ''}`}
                  onClick={() => setTab('records')}
                >
                  Records
                </button>
                <button
                  className={`tab${tab === 'summary' ? ' active' : ''}`}
                  onClick={() => setTab('summary')}
                >
                  Station-wise Summary
                </button>
              </div>

              {tab === 'records' && (
                <div className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">Records — {MONTHS[month - 1]} {year}</h2>
                      <p className="card-subtitle">{formatNumber(rows.length)} daily machine records</p>
                    </div>
                  </div>
                  <DataTable columns={recordColumns} data={rows} loading={loading} emptyMessage="No records" />
                </div>
              )}

              {tab === 'summary' && (
                <div className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">Station-wise Summary</h2>
                      <p className="card-subtitle">{formatNumber(stationWise.length)} stations</p>
                    </div>
                  </div>
                  <DataTable columns={statusColumns} data={stationWise} loading={loading} emptyMessage="No station data" />
                </div>
              )}
            </>
          )}
        </>
      )}

      <AddMonthlyDataModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          refetch();
        }}
        lineOptions={lineOptions}
      />
    </div>
  );
}

function AddMonthlyDataModal({ isOpen, onClose, onSuccess, lineOptions }) {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashCollected, setCashCollected] = useState('');
  const [padsRefilled, setPadsRefilled] = useState('');
  const [machineStatus, setMachineStatus] = useState('WORKING');
  const [issueType, setIssueType] = useState('NONE');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const { data: stationsData } = useApi(
    () => (lineId ? stationService.getAll({ lineId, limit: 200 }) : Promise.resolve(null)),
    [lineId]
  );
  const stationOpts = useMemo(() => {
    if (!stationsData?.stations) return [];
    return stationsData.stations.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));
  }, [stationsData]);

  const { data: machinesData } = useApi(
    () => (lineId && stationId ? machineService.getAll({ lineId, stationId, limit: 200 }) : Promise.resolve(null)),
    [lineId, stationId]
  );
  const machineOpts = useMemo(() => {
    if (!machinesData?.machines) return [];
    return machinesData.machines.map((m) => ({ value: m.id, label: m.machine_id }));
  }, [machinesData]);

  const { data: machineDetail } = useApi(
    () => (machineId ? machineService.getById(machineId) : Promise.resolve(null)),
    [machineId]
  );

  const resetForm = () => {
    setLineId('');
    setStationId('');
    setMachineId('');
    setRecordDate(new Date().toISOString().slice(0, 10));
    setCashCollected('');
    setPadsRefilled('');
    setMachineStatus('WORKING');
    setIssueType('NONE');
    setNotes('');
    setNextAction('');
    setErrors({});
  };

  const handleSave = async () => {
    const newErrors = {};
    if (!machineId) newErrors.machineId = 'Please select a machine';
    if (!recordDate) newErrors.recordDate = 'Date is required';
    if (Number(padsRefilled) < 0 || padsRefilled === '') newErrors.padsRefilled = 'Pads refilled must be >= 0';
    if (Number(cashCollected) < 0 || cashCollected === '') newErrors.cashCollected = 'Cash collected must be >= 0';

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      const result = await monthlyDataService.create({
        machineId,
        recordDate,
        cashCollected: Number(cashCollected) || 0,
        padsRefilled: Number(padsRefilled) || 0,
        machineStatus,
        issueType,
        notes,
        nextAction,
      });
      const c = result.cascade || {};
      const parts = [];
      if (c.machineStatusChanged) parts.push('machine status updated');
      if (c.refill?.created) parts.push('refill recorded');
      if (c.cashCollection?.created) parts.push('cash collection recorded');
      if (c.maintenance?.created) parts.push('maintenance opened');
      if (c.refill && !c.refill.created && c.refill.error) parts.push(`refill skipped (${c.refill.error})`);
      addToast(`Monthly data saved — ${parts.join(', ') || 'recorded'}`, 'success');
      resetForm();
      onSuccess();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { resetForm(); onClose(); }}
      title="Add Monthly Data"
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { resetForm(); onClose(); }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Update All Modules'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Metro Line</label>
          <select className="form-select" value={lineId} onChange={(e) => { setLineId(e.target.value); setStationId(''); setMachineId(''); }}>
            <option value="">Select line</option>
            {lineOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Station</label>
          <select className="form-select" value={stationId} onChange={(e) => { setStationId(e.target.value); setMachineId(''); }} disabled={!lineId}>
            <option value="">Select station</option>
            {stationOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Machine</label>
          <select className="form-select" value={machineId} onChange={(e) => setMachineId(e.target.value)} disabled={!stationId}>
            <option value="">Select machine</option>
            {machineOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {errors.machineId && <span className="form-error">{errors.machineId}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Record Date</label>
          <input type="date" className="form-input" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
          {errors.recordDate && <span className="form-error">{errors.recordDate}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Cash Collected (₹)</label>
          <input type="number" min="0" step="0.01" className="form-input" value={cashCollected} onChange={(e) => setCashCollected(e.target.value)} placeholder="e.g. 45" />
          {errors.cashCollected && <span className="form-error">{errors.cashCollected}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Pads Refilled</label>
          <input type="number" min="0" step="1" className="form-input" value={padsRefilled} onChange={(e) => setPadsRefilled(e.target.value)} placeholder="e.g. 25" />
          {errors.padsRefilled && <span className="form-error">{errors.padsRefilled}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Machine Status</label>
          <select className="form-select" value={machineStatus} onChange={(e) => setMachineStatus(e.target.value)}>
            {MONTHLY_MACHINE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Issue Type</label>
          <select className="form-select" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
            {MONTHLY_ISSUE_TYPES.map((s) => <option key={s} value={s}>{issueLabel(s)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea className="form-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks" />
        </div>
        <div className="form-group">
          <label className="form-label">Next Action</label>
          <input type="text" className="form-input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Optional action plan" />
        </div>
      </div>

      {machineDetail && (
        <div className="mach-panel">
          <div className="mach-panel-item">
            <span className="mach-panel-label">Machine</span>
            <span className="mach-panel-value">{machineDetail.machine_id}</span>
          </div>
          <div className="mach-panel-item">
            <span className="mach-panel-label">Status</span>
            <span className="mach-panel-value">{machineDetail.status}</span>
          </div>
          <div className="mach-panel-item">
            <span className="mach-panel-label">Current Stock</span>
            <span className="mach-panel-value">{formatNumber(machineDetail.current_stock ?? 0)}</span>
          </div>
          <div className="mach-panel-item">
            <span className="mach-panel-label">Capacity</span>
            <span className="mach-panel-value">{formatNumber(machineDetail.capacity ?? 0)}</span>
          </div>
          <div className="mach-panel-item">
            <span className="mach-panel-label">Saved By</span>
            <span className="mach-panel-value">{user?.name || '—'}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default MonthlyData;