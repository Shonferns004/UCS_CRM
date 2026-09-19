import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import usePagination from '../hooks/usePagination.js';
import useDebounce from '../hooks/useDebounce.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as machineService from '../services/machine.service.js';
import * as refillService from '../services/refill.service.js';
import * as reportService from '../services/report.service.js';
import * as stockService from '../services/stock.service.js';
import { formatDate, formatDateTime, formatNumber, getErrorMessage } from '../utils/formatters.js';
import { MONTHS } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

function Refills() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit, reset } = usePagination();

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [refilledBy, setRefilledBy] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const debouncedRefilledBy = useDebounce(refilledBy);

  useEffect(() => { reset(); }, [lineId, stationId, machineId, month, year, debouncedRefilledBy]);

  const filterParams = useMemo(() => {
    const p = { page, limit };
    if (lineId) p.lineId = lineId;
    if (stationId) p.stationId = stationId;
    if (machineId) p.machineId = machineId;
    if (month) p.month = month;
    if (year) p.year = year;
    if (debouncedRefilledBy) p.refilledBy = debouncedRefilledBy;
    return p;
  }, [page, limit, lineId, stationId, machineId, month, year, debouncedRefilledBy]);

  const filterKey = JSON.stringify(filterParams);

  const { data: linesData } = useApi(() => metroLineService.getAll({ limit: 100 }), []);
  const lineOptions = useMemo(() => {
    const lines = linesData?.lines || [];
    return lines.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));
  }, [linesData]);

  const { data: stationsData } = useApi(
    () => (lineId ? stationService.getAll({ lineId, limit: 200 }) : Promise.resolve(null)),
    [lineId]
  );
  const stationOptions = useMemo(() => {
    if (!stationsData?.stations) return [];
    return stationsData.stations.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));
  }, [stationsData]);

  const { data: machinesData } = useApi(
    () => (lineId || stationId ? machineService.getAll({ lineId: lineId || undefined, stationId: stationId || undefined, limit: 200 }) : Promise.resolve(null)),
    [lineId, stationId]
  );
  const machineOptions = useMemo(() => {
    if (!machinesData?.machines) return [];
    return machinesData.machines.map((m) => ({ value: m.id, label: m.machine_id }));
  }, [machinesData]);

  const { data: refillsData, loading, refetch } = useApi(
    () => refillService.getAll(filterParams),
    [filterKey]
  );

  const handleExport = useCallback((format) => {
    const p = { ...filterParams };
    delete p.page;
    delete p.limit;
    reportService
      .downloadExport('refills', p, format)
      .catch((err) => addToast(getErrorMessage(err), 'error'));
  }, [filterParams]);

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'lineId') { setLineId(value); setStationId(''); setMachineId(''); }
    else if (key === 'stationId') { setStationId(value); setMachineId(''); }
    else if (key === 'machineId') setMachineId(value);
    else if (key === 'month') setMonth(value);
    else if (key === 'year') setYear(value);
    else if (key === 'refilledBy') setRefilledBy(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setLineId(''); setStationId(''); setMachineId(''); setMonth(''); setYear(''); setRefilledBy('');
  }, []);

  const filters = [
    { key: 'lineId', type: 'select', value: lineId, label: 'All Metro Lines', options: lineOptions },
    { key: 'stationId', type: 'select', value: stationId, label: 'All Stations', options: stationOptions },
    { key: 'machineId', type: 'select', value: machineId, label: 'All Machines', options: machineOptions },
    { key: 'month', type: 'select', value: month, label: 'All Months', options: MONTHS.map((m, i) => ({ value: i + 1, label: m })) },
    { key: 'year', type: 'select', value: year, label: 'All Years', options: years.map((y) => ({ value: y, label: String(y) })) },
    { key: 'refilledBy', type: 'search', value: refilledBy, label: 'Search by staff...' },
  ];

  const columns = [
    {
      key: 'id', label: 'Refill ID',
      render: (val) => `R-${String(val).slice(0, 8)}`,
    },
    { key: 'refill_date', label: 'Date', render: (val) => formatDate(val) },
    { key: 'line_name', label: 'Metro Line' },
    { key: 'station_name', label: 'Station' },
    { key: 'machine_code', label: 'Machine' },
    { key: 'previous_stock', label: 'Previous Stock' },
    { key: 'refill_quantity', label: 'Pad Refill' },
    {
      key: 'cash_collected', label: 'Cash Collected',
      render: (val) => <span className="cell-strong">₹{formatNumber(val ?? 0)}</span>,
    },
    { key: 'new_stock', label: 'Current Stock' },
    { key: 'refilled_by', label: 'Staff' },
    { key: 'remark', label: 'Notes', render: (val) => val || '—' },
    {
      key: 'action', label: 'Action',
      render: (_, row) => (
        <div className="row-actions">
          <Link
            className="btn btn-outline btn-sm"
            to={`/machines/${row.machine_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            View
          </Link>
          {canEdit && (
            <>
              <button
                className="btn btn-outline btn-sm"
                onClick={(e) => { e.stopPropagation(); setEditTarget(row); }}
              >
                Edit
              </button>
              <button
                className="btn btn-outline btn-sm btn-danger"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const refills = refillsData?.refills || [];
  const meta = refillsData?.meta || {};
  const canEdit = hasRole('ADMIN', 'OPERATIONS');

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">Refill Management</h1>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => handleExport('pdf')} disabled={loading}>
            Download PDF
          </button>
          <button className="btn btn-outline" onClick={() => handleExport('xlsx')} disabled={loading}>
            Export Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Record Refill</button>
        </div>
      </div>

      <FilterBar filters={filters} onChange={handleFilterChange} onClear={handleClearFilters} loading={loading} />

      <div className="card">
        <DataTable
          columns={columns}
          data={refills}
          loading={loading}
          emptyMessage="No refill records found"
          onRowClick={(row) => navigate(`/machines/${row.machine_id}`)}
          pagination={{
            currentPage: meta.page || page,
            totalPages: meta.totalPages || 1,
            totalItems: meta.total || 0,
            limit: meta.limit || limit,
            onLimitChange: (val) => { setLimit(val); setPage(1); },
          }}
          onPageChange={setPage}
        />
      </div>

      <RecordRefillModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); refetch(); }}
        userName={user?.name || ''}
        lineOptions={lineOptions}
      />

      {editTarget && (
        <EditRefillModal
          isOpen={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); refetch(); }}
          record={editTarget}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await refillService.remove(deleteTarget.id);
              addToast('Refill record deleted', 'success');
              setDeleteTarget(null);
              refetch();
            } catch (err) {
              addToast(getErrorMessage(err), 'error');
            }
          }}
          title="Delete Refill Record"
          message={`Delete the refill of ${deleteTarget.refill_quantity} pads for ${deleteTarget.station_name || 'this station'} (${deleteTarget.machine_code || ''}) on ${formatDate(deleteTarget.refill_date)}? The machine stock and central stock will be adjusted.`}
          confirmLabel="Delete"
        />
      )}
    </div>
  );
}

function RecordRefillModal({ isOpen, onClose, onSuccess, userName, lineOptions }) {
  const { addToast } = useToast();

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [refillQuantity, setRefillQuantity] = useState('');
  const [cashCollected, setCashCollected] = useState('');
  const [refillDate, setRefillDate] = useState(new Date().toISOString().slice(0, 10));
  const [refilledBy, setRefilledBy] = useState(userName || '');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [remainingCentral, setRemainingCentral] = useState(null);

  useEffect(() => {
    if (isOpen) {
      stockService.getRemaining().then(r => setRemainingCentral(r.remaining)).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!refilledBy && userName) setRefilledBy(userName);
  }, [userName, refilledBy]);

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

  const capacity = selectedMachine?.capacity ?? machineDetail?.capacity ?? 0;
  const currentStock = selectedMachine?.current_stock ?? machineDetail?.current_stock ?? 0;
  const availableSpace = capacity - currentStock;

  useEffect(() => {
    if (machineDetail) setSelectedMachine(machineDetail);
  }, [machineDetail]);

  const qty = Number(refillQuantity) || 0;
  const exceedsCapacity = qty > availableSpace;

  useEffect(() => {
    setErrors((prev) => {
      const next = { ...prev, refillQuantity: undefined };
      if (refillQuantity && exceedsCapacity) {
        next.refillQuantity = 'Stock would exceed capacity';
      }
      return next;
    });
  }, [refillQuantity, availableSpace, exceedsCapacity]);

  const resetForm = () => {
    setLineId('');
    setStationId('');
    setMachineId('');
    setSelectedMachine(null);
    setRefillQuantity('');
    setCashCollected('');
    setRefillDate(new Date().toISOString().slice(0, 10));
    setRefilledBy(userName);
    setRemark('');
    setErrors({});
  };

  const handleSave = async () => {
    const newErrors = {};
    if (!machineId) newErrors.machineId = 'Please select a machine';
    if (!refillQuantity || Number(refillQuantity) <= 0) newErrors.refillQuantity = 'Refill quantity is required';
    if (!refillDate) newErrors.refillDate = 'Date is required';
    if (exceedsCapacity) newErrors.refillQuantity = 'Stock would exceed capacity';
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      await refillService.create({
        machineId,
        stationId,
        refillQuantity: qty,
        cashCollected: Number(cashCollected) || 0,
        refillDate,
        refilledBy: refilledBy || userName || 'Staff',
        remark,
      });
      addToast('Refill recorded successfully', 'success');
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
      title="Record Refill"
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { resetForm(); onClose(); }}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Refill'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Metro Line</label>
        <select className="form-select" value={lineId} onChange={(e) => { setLineId(e.target.value); setStationId(''); setMachineId(''); setSelectedMachine(null); }}>
          <option value="">Select line</option>
          {lineOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Station</label>
        <select className="form-select" value={stationId} onChange={(e) => { setStationId(e.target.value); setMachineId(''); setSelectedMachine(null); }} disabled={!lineId}>
          <option value="">Select station</option>
          {stationOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Machine</label>
        <select className="form-select" value={machineId} onChange={(e) => { setMachineId(e.target.value); setErrors((prev) => ({ ...prev, machineId: undefined })); }} disabled={!stationId}>
          <option value="">Select machine</option>
          {machineOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {errors.machineId && <span className="form-error">{errors.machineId}</span>}
      </div>
      {selectedMachine && (
        <div className="card" style={{ marginBottom: '16px', padding: '12px', background: '#f9f9f9' }}>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Capacity</span>
              <span className="info-value">{capacity}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Current Stock</span>
              <span className="info-value">{currentStock}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Available Space</span>
              <span className="info-value">{availableSpace}</span>
            </div>
            {remainingCentral !== null && (
              <div className="info-item">
                <span className="info-label">Central Stock Left</span>
                <span className="info-value" style={{ color: remainingCentral === 0 ? '#dc2626' : remainingCentral <= 50 ? '#d97706' : undefined }}>
                  {formatNumber(remainingCentral)} pads
                </span>
              </div>
            )}
          </div>
          <div style={{ marginTop: '8px' }}>
            <div className="stock-bar">
              <div className={`stock-bar-fill ${(selectedMachine.stock_percentage ?? 0) <= 20 ? 'stock-low' : ''}`} style={{ width: `${selectedMachine.stock_percentage ?? 0}%` }} />
            </div>
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Refill Quantity</label>
        <input
          type="number"
          className="form-input"
          min={0}
          max={availableSpace}
          value={refillQuantity}
          onChange={(e) => { setRefillQuantity(e.target.value); setErrors((prev) => ({ ...prev, refillQuantity: undefined })); }}
          placeholder={`Max: ${availableSpace}`}
        />
        {errors.refillQuantity && <span className="form-error">{errors.refillQuantity}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Cash Collected (₹)</label>
        <input
          type="number"
          className="form-input"
          min={0}
          step="0.01"
          value={cashCollected}
          onChange={(e) => setCashCollected(e.target.value)}
          placeholder="e.g. 45"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Refill Date</label>
        <input type="date" className="form-input" value={refillDate} onChange={(e) => { setRefillDate(e.target.value); setErrors((prev) => ({ ...prev, refillDate: undefined })); }} />
        {errors.refillDate && <span className="form-error">{errors.refillDate}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Refilled By</label>
        <input type="text" className="form-input" value={refilledBy} onChange={(e) => setRefilledBy(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Remark</label>
        <textarea className="form-textarea" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </div>
    </Modal>
  );
}

function EditRefillModal({ isOpen, onClose, onSuccess, record }) {
  const { addToast } = useToast();
  const [refillQuantity, setRefillQuantity] = useState('');
  const [cashCollected, setCashCollected] = useState('');
  const [refillDate, setRefillDate] = useState('');
  const [refilledBy, setRefilledBy] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const resetForm = () => {
    setRefillQuantity(record?.refill_quantity != null ? String(record.refill_quantity) : '');
    setCashCollected(record?.cash_collected != null ? String(record.cash_collected) : '');
    setRefillDate(record?.refill_date ? String(record.refill_date).slice(0, 10) : '');
    setRefilledBy(record?.refilled_by || '');
    setRemark(record?.remark || '');
    setErrors({});
  };

  const qty = Number(refillQuantity) || 0;

  const handleSave = async () => {
    const newErrors = {};
    if (refillQuantity === '' || refillQuantity == null) newErrors.refillQuantity = 'Refill quantity is required';
    if (!Number.isInteger(qty) || qty < 0) newErrors.refillQuantity = 'Quantity must be a non-negative integer';
    if (!refillDate) newErrors.refillDate = 'Date is required';
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      await refillService.update(record.id, {
        refillQuantity: qty,
        cashCollected: cashCollected === '' ? 0 : Number(cashCollected),
        refillDate,
        refilledBy: refilledBy || record?.refilled_by || 'Staff',
        remark,
      });
      addToast('Refill updated successfully', 'success');
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
      title={`Edit Refill — ${record?.machine_code || ''}`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { resetForm(); onClose(); }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      {record && (
        <div className="card" style={{ marginBottom: '16px', padding: '12px', background: '#f9f9f9' }}>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Station</span>
              <span className="info-value">{record.station_name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Metro Line</span>
              <span className="info-value">{record.line_name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Previous Stock</span>
              <span className="info-value">{record.previous_stock}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Current Stock</span>
              <span className="info-value">{record.new_stock}</span>
            </div>
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Refill Quantity</label>
        <input
          type="number"
          className="form-input"
          min={0}
          value={refillQuantity}
          onChange={(e) => { setRefillQuantity(e.target.value); setErrors((prev) => ({ ...prev, refillQuantity: undefined })); }}
          placeholder="Actual pads refilled"
          autoFocus
        />
        {errors.refillQuantity && <span className="form-error">{errors.refillQuantity}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Cash Collected (₹)</label>
        <input
          type="number"
          className="form-input"
          min={0}
          step="0.01"
          value={cashCollected}
          onChange={(e) => setCashCollected(e.target.value)}
          placeholder="e.g. 45"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Refill Date</label>
        <input type="date" className="form-input" value={refillDate} onChange={(e) => { setRefillDate(e.target.value); setErrors((prev) => ({ ...prev, refillDate: undefined })); }} />
        {errors.refillDate && <span className="form-error">{errors.refillDate}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Refilled By</label>
        <input type="text" className="form-input" value={refilledBy} onChange={(e) => setRefilledBy(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Remark</label>
        <textarea className="form-textarea" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </div>
    </Modal>
  );
}

export default Refills;
