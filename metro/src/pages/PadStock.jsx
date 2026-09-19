import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import * as stockService from '../services/stock.service.js';
import * as machineService from '../services/machine.service.js';
import * as refillService from '../services/refill.service.js';
import * as reportService from '../services/report.service.js';
import { getErrorMessage, formatNumber, formatDate } from '../utils/formatters.js';
import { MONTHS } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import KpiCard from '../components/KpiCard.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

function RefillStatusBadge({ status }) {
  const variant = status === 'COMPLETED' ? 'success' : status === 'PENDING' ? 'warning' : 'danger';
  const label =
    status === 'UNABLE_TO_REFILL'
      ? 'Unable to Refill'
      : status
        ? status.charAt(0) + status.slice(1).toLowerCase()
        : '';
  return <span className={`status-badge ${variant} sm`}>{label}</span>;
}

function StockStatusBadge({ status }) {
  const variant = status === 'EMPTY' ? 'danger' : status === 'LOW' ? 'warning' : 'success';
  const label = status ? status.charAt(0) + status.slice(1).toLowerCase() : '';
  return <span className={`status-badge ${variant} sm`}>{label}</span>;
}

function EditMonthlyModal({ isOpen, onClose, onSuccess, row, yearMonth }) {
  const { addToast } = useToast();
  const [quantity, setQuantity] = useState('');
  const [refillDate, setRefillDate] = useState('');
  const [cash, setCash] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!row) return;
    setQuantity(Number(row.refill_quantity) > 0 ? String(row.refill_quantity) : '');
    setRefillDate(row.refill_date ? String(row.refill_date).slice(0, 10) : `${yearMonth}-01`);
    setCash(Number(row.cash_collected) > 0 ? String(row.cash_collected) : '');
    setStatus(
      row.refill_status === 'UNABLE_TO_REFILL'
        ? 'UNABLE_TO_REFILL'
        : row.refill_status === 'COMPLETED'
          ? 'COMPLETED'
          : 'PENDING'
    );
    setRemark('');
    setErrors({});
  }, [row, yearMonth]);

  const capacity = Number(row?.capacity) || 0;
  const currentStock = Number(row?.current_stock) || 0;
  const qty = Number(quantity) || 0;
  const exceedsCapacity = qty > capacity;

  const resetForm = () => setErrors({});

  const handleSave = async () => {
    const newErrors = {};
    if (quantity === '' || qty <= 0) {
      if (status !== 'UNABLE_TO_REFILL' && status !== 'COMPLETED') {
        newErrors.quantity = 'Enter refill quantity or mark the station unable';
      }
    }
    if (exceedsCapacity) newErrors.quantity = `Cannot exceed machine capacity (${capacity})`;
    if (!refillDate) newErrors.refillDate = 'Date is required';
    if (Number(cash) < 0 || isNaN(Number(cash))) newErrors.cash = 'Cash must be a non-negative number';
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      await stockService.saveMonthlyRefill(row.machine_uuid, {
        yearMonth,
        refillQuantity: qty,
        refillDate,
        cashCollected: cash === '' ? 0 : Number(cash),
        refillStatus: qty > 0 ? 'COMPLETED' : status,
        remark,
      });
      addToast('Monthly refill saved', 'success');
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
      title={`Edit Monthly Refill — ${row?.machine_id || ''}`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { resetForm(); onClose(); }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      {row && (
        <>
          <div className="card" style={{ marginBottom: '16px', padding: '12px', background: '#f9f9f9' }}>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Station</span>
                <span className="info-value">{row.station_name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Metro Line</span>
                <span className="info-value">{row.line_name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Capacity</span>
                <span className="info-value">{capacity}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Current Pads</span>
                <span className="info-value">{currentStock}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Available Space</span>
                <span className="info-value">{capacity - currentStock}</span>
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Refill Quantity</label>
            <input
              type="number"
              className="form-input"
              min={0}
              max={capacity}
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); setErrors((prev) => ({ ...prev, quantity: undefined })); }}
              placeholder={`Enter pads refilled for ${yearMonth}`}
            />
            {errors.quantity && <span className="form-error">{errors.quantity}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Refill Date</label>
            <input type="date" className="form-input" value={refillDate} onChange={(e) => { setRefillDate(e.target.value); setErrors((prev) => ({ ...prev, refillDate: undefined })); }} />
            {errors.refillDate && <span className="form-error">{errors.refillDate}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Cash Collected (₹)</label>
            <input
              type="number"
              className="form-input"
              min={0}
              step="0.01"
              value={cash}
              onChange={(e) => { setCash(e.target.value); setErrors((prev) => ({ ...prev, cash: undefined })); }}
              placeholder="Cash collected this month (never treated as pads)"
            />
            {errors.cash && <span className="form-error">{errors.cash}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Refill Status</label>
            <select className="form-select" value={status} onChange={(e) => { setStatus(e.target.value); setErrors((prev) => ({ ...prev, quantity: undefined })); }}>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="UNABLE_TO_REFILL">Unable to Refill</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Remark</label>
            <textarea className="form-textarea" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={`Monthly refill ${yearMonth}`} />
          </div>
          <p className="text-muted" style={{ fontSize: '12px', marginTop: '8px' }}>
            Saving with a refill quantity above 0 marks the station as Completed. Quantity 0 saves the selected status.
            Cash is saved to cash collections and never affects pads or central stock.
          </p>
        </>
      )}
    </Modal>
  );
}

function AdminPadStock() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('monthly');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const [statusTarget, setStatusTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useApi(() => stockService.getSummary(), []);

  const {
    data: monthly,
    loading: monthlyLoading,
    error: monthlyError,
    refetch: refetchMonthly,
  } = useApi(() => stockService.getMonthly(year, month), [year, month]);

  const monthOptions = useMemo(() =>
    MONTHS.map((name, i) => ({ value: i + 1, label: name })),
  []);

  const canEdit = hasRole('ADMIN', 'OPERATIONS');

  const stationColumns = [
    { key: 'line_name', label: 'Metro Line' },
    { key: 'station_name', label: 'Station' },
    { key: 'machine_id', label: 'Machine' },
    {
      key: 'refill_quantity',
      label: 'Refill Quantity',
      render: (val) => (Number(val) > 0 ? formatNumber(val) : <span className="text-muted">0</span>),
    },
    { key: 'refill_date', label: 'Refill Date', render: (val) => (val ? formatDate(val) : '—') },
    {
      key: 'stock_value',
      label: 'Stock Value',
      render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span>,
    },
    {
      key: 'cash_collected',
      label: 'Cash Collected',
      render: (val) =>
        Number(val) > 0 ? (
          <span className="cell-strong" style={{ color: 'var(--color-success, #15803d)' }}>₹{formatNumber(val ?? 0)}</span>
        ) : (
          <span className="text-muted">₹0</span>
        ),
    },
    { key: 'refill_status', label: 'Refill Status', render: (val) => <RefillStatusBadge status={val} /> },
    {
      key: 'action',
      label: 'Actions',
      render: (_, row) => (
        <div className="row-actions">
          {canEdit && (
            <button
              className="btn btn-outline btn-sm"
              onClick={(e) => { e.stopPropagation(); setEditTarget(row); }}
            >
              Edit
            </button>
          )}
          {row.refill_status === 'PENDING' && canEdit && (
            <button
              className="btn btn-outline btn-sm"
              onClick={(e) => { e.stopPropagation(); setStatusTarget({ row, status: 'UNABLE_TO_REFILL' }); }}
            >
              Unable
            </button>
          )}
          {row.refill_status === 'UNABLE_TO_REFILL' && canEdit && (
            <button
              className="btn btn-outline btn-sm"
              onClick={(e) => { e.stopPropagation(); setStatusTarget({ row, status: 'PENDING' }); }}
            >
              Mark Pending
            </button>
          )}
          {!canEdit && <span className="text-muted">—</span>}
        </div>
      ),
    },
  ];

  const pendingColumns = [
    { key: 'line_name', label: 'Metro Line' },
    { key: 'station_name', label: 'Station' },
    { key: 'machine_id', label: 'Machine' },
    { key: 'current_stock', label: 'Current Pads', render: (val) => formatNumber(val ?? 0) },
    { key: 'stock_status', label: 'Stock Status', render: (val) => <RefillStatusBadge status={val} /> },
    { key: 'last_refill_at', label: 'Last Refill Date', render: (val) => (val ? formatDate(val) : '—') },
    {
      key: 'action',
      label: 'Action',
      render: (_, row) => (
        <button
          className="btn btn-outline btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/refills');
          }}
        >
          Refill
        </button>
      ),
    },
  ];

  const handleExport = useCallback((format) => {
    reportService
      .downloadExport('monthly', { year, month }, format)
      .catch((err) => addToast(getErrorMessage(err), 'error'));
  }, [year, month, addToast]);

  const handleStatusConfirm = async () => {
    if (!statusTarget) return;
    const { row, status } = statusTarget;
    try {
      await stockService.setMonthlyRefillStatus({
        machineId: row.machine_uuid,
        yearMonth,
        refillStatus: status,
        remark: status === 'UNABLE_TO_REFILL' ? 'Marked unable to refill this month' : null,
      });
      addToast(`Station marked as ${status === 'UNABLE_TO_REFILL' ? 'Unable to Refill' : 'Pending'}`, 'success');
      setStatusTarget(null);
      refetchMonthly();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const ms = monthly?.summary || null;
  const stationList = monthly?.stationList || [];

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">Pad Stock</h1>
        <div className="filter-inline">
          <select className="form-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select className="form-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="report-tabs">
        <button className={`tab${tab === 'monthly' ? ' active' : ''}`} onClick={() => setTab('monthly')}>
          Monthly Refill
        </button>
        <button className={`tab${tab === 'summary' ? ' active' : ''}`} onClick={() => setTab('summary')}>
          Stock Summary
        </button>
      </div>

      {tab === 'monthly' && (
        <>
          {monthlyLoading ? (
            <LoadingSpinner message="Loading monthly refill data..." />
          ) : monthlyError ? (
            <ErrorState message={getErrorMessage(monthlyError)} />
          ) : ms ? (
            <>
              <div className="kpi-grid">
                <KpiCard
                  title="Total Initial Stock"
                  value={`${formatNumber(ms.totalInitialStock)} pads`}
                  icon="📦"
                  color="primary"
                  subtitle={`Value: ₹${formatNumber(ms.initialStockValue)}`}
                />
                <KpiCard
                  title="Refilled Stations"
                  value={`${formatNumber(ms.completedStations)} / ${formatNumber(ms.totalStations)}`}
                  icon="🚚"
                  color="blue"
                  subtitle="Stations refilled this month"
                />
                <KpiCard
                  title="Pending Stations"
                  value={formatNumber(ms.pendingStations)}
                  icon="⏳"
                  color="warning"
                  subtitle={`${formatNumber(ms.unableToRefill)} marked unable to refill`}
                />
                <KpiCard
                  title="Total Pads Refilled"
                  value={`${formatNumber(ms.totalPadsRefilled)} pads`}
                  icon="📤"
                  color="teal"
                  subtitle={`Across ${formatNumber(ms.completedStations)} stations`}
                />
                <KpiCard
                  title="Cash Collected"
                  value={`₹${formatNumber(ms.totalCashCollected ?? 0)}`}
                  icon="💰"
                  color="success"
                  subtitle={`From ${formatNumber(ms.totalStations)} stations this month`}
                />
                <KpiCard
                  title="Remaining Central Stock"
                  value={`${formatNumber(ms.remainingCentralStock)} pads`}
                  icon="🏬"
                  color="success"
                  subtitle={`Value: ₹${formatNumber(ms.remainingCentralValue)}`}
                />
                <KpiCard
                  title="Price Per Pad"
                  value={`₹${formatNumber(ms.pricePerPad)}`}
                  icon="💵"
                  color="warning"
                  subtitle="Value / selling price"
                />
                <KpiCard
                  title="Remaining Stock Value"
                  value={`₹${formatNumber(ms.remainingCentralValue)}`}
                  icon="💰"
                  color="success"
                  subtitle={`${formatNumber(ms.remainingCentralStock)} pads in central`}
                />
                <KpiCard
                  title="Total Value Distributed"
                  value={`₹${formatNumber(ms.refilledValue)}`}
                  icon="🧮"
                  color="info"
                  subtitle={`${formatNumber(ms.totalPadsRefilled)} pads × ₹${formatNumber(ms.pricePerPad)}`}
                />
              </div>

              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <h2 className="card-title">Monthly Refill List — {MONTHS[month - 1]} {year}</h2>
                  <div className="header-badges">
                    <span className="badge-success">{ms.completedStations} completed</span>
                    <span className="badge-warning">{ms.pendingStations} pending</span>
                    <span className="badge-danger">{ms.unableToRefill} unable</span>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleExport('pdf')}
                      disabled={monthlyLoading}
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
                <DataTable
                  columns={stationColumns}
                  data={stationList}
                  loading={monthlyLoading}
                  emptyMessage="No machines found for this month"
                  onRowClick={(row) => navigate(`/machines/${row.machine_uuid}`)}
                />
              </div>

              <div className="note" style={{ marginTop: '12px' }}>
                <p className="text-muted" style={{ fontSize: '13px' }}>
                  Refill figures are calculated from saved refill records and cash collected is read from cash
                  collection entries for this month. Central stock decreases only when a refill is saved — pending
                  stations never reduce stock. Refill quantity is never treated as cash collected.
                </p>
              </div>
            </>
          ) : null}
        </>
      )}

      {tab === 'summary' && (
        <>
          {summaryError ? (
            <ErrorState message={getErrorMessage(summaryError)} onRetry={refetchSummary} />
          ) : summaryLoading ? (
            <LoadingSpinner message="Loading stock summary..." />
          ) : summary ? (
            <>
              <div className="kpi-grid">
                <KpiCard
                  title="Initial Stock"
                  value={`${formatNumber(summary.initialStock)} pads`}
                  icon="📦"
                  color="primary"
                  subtitle={`Value: ₹${formatNumber(summary.initialStockValue)}`}
                />
                <KpiCard
                  title="Distributed"
                  value={`${formatNumber(summary.totalDistributed)} pads`}
                  icon="🚚"
                  color="blue"
                  subtitle={`Value: ₹${formatNumber(summary.distributedValue)}`}
                />
                <KpiCard
                  title="Remaining Central Stock"
                  value={`${formatNumber(summary.remainingCentral)} pads`}
                  icon="🏬"
                  color="success"
                  subtitle={`Value: ₹${formatNumber(summary.remainingCentralValue)}`}
                />
                <KpiCard
                  title="Price Per Pad"
                  value={`₹${formatNumber(summary.pricePerPad)}`}
                  icon="💵"
                  color="warning"
                  subtitle="Selling / value price"
                />
                <KpiCard
                  title="Remaining Stock Value"
                  value={`₹${formatNumber(summary.remainingCentralValue)}`}
                  icon="💰"
                  color="success"
                  subtitle={`${formatNumber(summary.remainingCentral)} pads in central`}
                />
                <KpiCard
                  title="Total Pads Inside Machines"
                  value={`${formatNumber(summary.totalMachinePads)} pads`}
                  icon="🖥️"
                  color="info"
                  subtitle={`${formatNumber(summary.activeMachines)} active machines`}
                />
              </div>

              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <h2 className="card-title">Station-wise Stock</h2>
                  <span className="badge-info">{summary.stationWise?.length || 0} machines</span>
                </div>
                <DataTable
                  columns={[
                    { key: 'line_name', label: 'Metro Line' },
                    { key: 'station_name', label: 'Station' },
                    { key: 'machine_id', label: 'Machine' },
                    { key: 'current_stock', label: 'Current Pads', render: (val) => formatNumber(val ?? 0) },
                    { key: 'stock_value', label: 'Stock Value', render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span> },
                    { key: 'stock_status', label: 'Stock Status', render: (val) => <StockStatusBadge status={val} /> },
                    { key: 'last_refill_at', label: 'Last Refill Date', render: (val) => (val ? formatDate(val) : '—') },
                  ]}
                  data={summary.stationWise || []}
                  loading={summaryLoading}
                  emptyMessage="No station stock data found"
                  onRowClick={(row) => navigate(`/machines/${row.machine_id}`)}
                />
              </div>

              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <h2 className="card-title">Refill Required</h2>
                  <span className="badge-warning">{summary.pendingRefill?.length || 0} machines</span>
                </div>
                <DataTable
                  columns={pendingColumns}
                  data={summary.pendingRefill || []}
                  loading={summaryLoading}
                  emptyMessage="No machines need refill — all stock levels are good"
                />
              </div>
            </>
          ) : null}
        </>
      )}

      {editTarget && (
        <EditMonthlyModal
          isOpen={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); refetchMonthly(); refetchSummary(); }}
          row={editTarget}
          yearMonth={yearMonth}
        />
      )}

      {statusTarget && (
        <ConfirmDialog
          isOpen={!!statusTarget}
          onClose={() => setStatusTarget(null)}
          onConfirm={handleStatusConfirm}
          title={statusTarget.status === 'UNABLE_TO_REFILL' ? 'Mark Unable to Refill' : 'Mark as Pending'}
          message={`${statusTarget.status === 'UNABLE_TO_REFILL'
            ? 'Mark'
            : 'Reset the refill status to Pending for'} ${statusTarget.row?.station_name} (${statusTarget.row?.machine_id}) for ${MONTHS[month - 1]} ${year}?`}
          confirmLabel={statusTarget.status === 'UNABLE_TO_REFILL' ? 'Mark Unable' : 'Mark Pending'}
          confirmVariant={statusTarget.status === 'UNABLE_TO_REFILL' ? 'danger' : 'warning'}
        />
      )}
    </div>
  );
}

function UserRefillForm() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [stations, setStations] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [refillDate, setRefillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refillTime, setRefillTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [refillQuantity, setRefillQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [price, setPrice] = useState(5);

  useEffect(() => {
    let active = true;
    machineService
      .getAll({ limit: 500 })
      .then((r) => { if (active) setStations(r.machines || []); })
      .catch(() => {});
    stockService
      .getConfig()
      .then((c) => { if (active && c?.pricePerPad != null) setPrice(Number(c.pricePerPad)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const oldStock = Number(selectedMachine?.current_stock) || 0;
  const capacity = Number(selectedMachine?.capacity) || 0;
  const availableSpace = Math.max(0, capacity - oldStock);
  const qty = Number(refillQuantity) || 0;
  const totalCollected = Math.max(0, qty * price);
  const loss = oldStock * price;
  const profit = totalCollected - loss;

  const handleSubmit = async () => {
    const newErrors = {};
    if (!refillDate) newErrors.refillDate = 'Refill Date is required';
    if (!refillTime) newErrors.refillTime = 'Refill Time is required';
    if (!selectedMachine) newErrors.station = 'Please select a station';
    if (refillQuantity === '' || refillQuantity == null) {
      newErrors.quantity = 'Refill Quantity is required';
    } else if (!Number.isInteger(qty) || qty < 0) {
      newErrors.quantity = 'Quantity must be a non-negative whole number';
    } else if (qty > availableSpace) {
      newErrors.quantity = `Cannot exceed available space (${availableSpace} pads)`;
    }
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }
    setSaving(true);
    try {
      await refillService.create({
        machineId: selectedMachine.id,
        stationId: selectedMachine.station_id,
        refillQuantity: qty,
        cashCollected: totalCollected,
        refillDate: `${refillDate}T${refillTime}:00`,
        refilledBy: user?.name || 'Staff',
        remark: `Old stock: ${oldStock} | Loss: ₹${loss} | Profit: ₹${profit}`,
      });
      addToast('Refilled successfully', 'success');
      setRefillQuantity('');
      setSelectedMachine(null);
      setErrors({});
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Pad Stock</h1>
      </div>

      <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="card-header">
          <h2 className="card-title">PAD REFILL</h2>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Refill Date</label>
              <input
                type="date"
                className="form-input"
                value={refillDate}
                onChange={(e) => { setRefillDate(e.target.value); setErrors((prev) => ({ ...prev, refillDate: undefined })); }}
              />
              {errors.refillDate && <span className="form-error">{errors.refillDate}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Refill Time</label>
              <input
                type="time"
                className="form-input"
                value={refillTime}
                onChange={(e) => { setRefillTime(e.target.value); setErrors((prev) => ({ ...prev, refillTime: undefined })); }}
              />
              {errors.refillTime && <span className="form-error">{errors.refillTime}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Station Name</label>
            <select
              className="form-select"
              value={selectedMachine?.id || ''}
              onChange={(e) => {
                const machine = stations.find((m) => m.id === e.target.value) || null;
                setSelectedMachine(machine);
                setErrors((prev) => ({ ...prev, station: undefined }));
              }}
            >
              <option value="">Select Station</option>
              {stations.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.station_name || m.station_id} — {m.machine_id}
                </option>
              ))}
            </select>
            {errors.station && <span className="form-error">{errors.station}</span>}
          </div>

          {selectedMachine && (
            <div className="info-grid" style={{ background: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <div className="info-item">
                <span className="info-label">Old Refill (pads already in machine)</span>
                <span className="info-value">{oldStock} pads</span>
              </div>
              <div className="info-item">
                <span className="info-label">Capacity</span>
                <span className="info-value">{capacity} pads</span>
              </div>
              <div className="info-item">
                <span className="info-label">Available Space</span>
                <span className="info-value">{availableSpace} pads</span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Refill Quantity</label>
            <input
              type="number"
              className="form-input"
              min={0}
              max={availableSpace || undefined}
              value={refillQuantity}
              onChange={(e) => { setRefillQuantity(e.target.value); setErrors((prev) => ({ ...prev, quantity: undefined })); }}
              placeholder={selectedMachine ? `Enter quantity (max ${availableSpace})` : 'Select station first'}
              disabled={!selectedMachine}
            />
            {errors.quantity && <span className="form-error">{errors.quantity}</span>}
          </div>

          <div className="info-grid" style={{ background: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 20 }}>
            <div className="info-item">
              <span className="info-label">Total Collected</span>
              <span className="info-value">₹{formatNumber(totalCollected)}</span>
            </div>
            <div className="info-item">
              <span className="info-label" style={{ color: '#b91c1c' }}>Loss</span>
              <span className="info-value" style={{ color: '#b91c1c' }}>₹{formatNumber(loss)}</span>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px 16px', fontSize: 16 }}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Submitting...' : 'Submit Refill'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PadStock() {
  const { user } = useAuth();
  const isNormalUser = user?.role !== 'ADMIN' && user?.role !== 'OPERATIONS';
  if (isNormalUser) return <UserRefillForm />;
  return <AdminPadStock />;
}

export default PadStock;