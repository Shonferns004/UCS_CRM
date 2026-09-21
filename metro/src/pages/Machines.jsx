import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import useToast from '../hooks/useToast.js';
import usePagination from '../hooks/usePagination.js';
import useDebounce from '../hooks/useDebounce.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as machineService from '../services/machine.service.js';
import { getErrorMessage, formatDate } from '../utils/formatters.js';
import { MACHINE_STATUSES, MACHINE_TYPES, MACHINE_CAPACITY, SLOTS_PER_MACHINE, SLOT_CAPACITY } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ErrorState from '../components/ErrorState.jsx';

function buildEmptyForm() {
  return {
    machineId: '',
    lineId: '',
    stationId: '',
    location: '',
    machineType: '',
    capacity: MACHINE_CAPACITY,
    currentStock: 0,
    lowStockThreshold: 10,
    installationDate: '',
    status: 'ACTIVE',
    remark: '',
  };
}

function Machines() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit, reset } = usePagination();

  const [lineId, setLineId] = useState(searchParams.get('lineId') || '');
  const [stationId, setStationId] = useState(searchParams.get('stationId') || '');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(buildEmptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filterKey = JSON.stringify({
    lineId,
    stationId,
    status,
    search: debouncedSearch,
  });

  useEffect(() => {
    reset();
  }, [lineId, stationId, status, debouncedSearch, reset]);

  const params = useMemo(() => {
    const p = { page, limit };
    if (lineId) p.lineId = lineId;
    if (stationId) p.stationId = stationId;
    if (status) p.status = status;
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [lineId, stationId, status, debouncedSearch, page, limit]);

  const { data: linesData, loading: linesLoading } = useApi(
    () => metroLineService.getAll({ limit: 100 }),
    []
  );

  const lineOptions = useMemo(() => {
    const lines = linesData?.lines || [];
    return lines.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));
  }, [linesData]);

  const { data: filterStationsData, loading: filterStationsLoading } = useApi(
    () => (lineId ? stationService.getAll({ lineId, limit: 200 }) : Promise.resolve(null)),
    [lineId]
  );

  const filterStationOptions = useMemo(() => {
    const stations = filterStationsData?.stations || [];
    return stations.map((s) => ({ value: s.id, label: s.name }));
  }, [filterStationsData]);

  const {
    data: machinesData,
    loading,
    error,
    refetch,
  } = useApi(() => machineService.getAll(params), [JSON.stringify(params)]);

  const meta = machinesData?.meta || {};
  const totalPages = meta.totalPages ?? meta.total_pages ?? 1;
  const totalItems = meta.totalItems ?? meta.total ?? 0;

  const { data: modalStationsData } = useApi(
    () =>
      form.lineId
        ? stationService.getAll({ lineId: form.lineId, limit: 200 })
        : Promise.resolve(null),
    [form.lineId]
  );

  const modalStationOptions = useMemo(() => {
    const stations = modalStationsData?.stations || [];
    return stations.map((s) => ({ value: s.id, label: s.name }));
  }, [modalStationsData]);

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'lineId') {
      setLineId(value);
      setStationId('');
    } else if (key === 'stationId') {
      setStationId(value);
    } else if (key === 'status') {
      setStatus(value);
    } else if (key === 'search') {
      setSearch(value);
    }
  }, []);

  const handleClearFilters = useCallback(() => {
    setLineId('');
    setStationId('');
    setStatus('');
    setSearch('');
  }, []);

  const filters = [
    {
      key: 'lineId',
      type: 'select',
      value: lineId,
      label: 'All Metro Lines',
      options: lineOptions,
    },
    {
      key: 'stationId',
      type: 'select',
      value: stationId,
      label: 'All Stations',
      options: filterStationOptions,
    },
    {
      key: 'status',
      type: 'select',
      value: status,
      label: 'All Statuses',
      options: MACHINE_STATUSES.map((s) => ({
        value: s,
        label: s.charAt(0) + s.slice(1).toLowerCase(),
      })),
    },
    { key: 'search', type: 'search', value: search, label: 'Search machines...' },
  ];

  const columns = [
    { key: 'machine_id', label: 'Machine ID' },
    { key: 'line_name', label: 'Line' },
    { key: 'station_name', label: 'Station' },
    { key: 'location', label: 'Location' },
    { key: 'capacity', label: 'Capacity', render: (val) => `${val ?? MACHINE_CAPACITY} (${SLOTS_PER_MACHINE}×${SLOT_CAPACITY})` },
    { key: 'current_stock', label: 'Current Stock' },
    {
      key: 'stock_percentage',
      label: 'Stock %',
      render: (val) => `${val ?? 0}%`,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <StatusBadge status={val} size="sm" />,
    },
    {
      key: 'last_refill_at',
      label: 'Last Refill',
      render: (val) => formatDate(val) || '—',
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <span className="inline-actions">
          <button
            className="btn btn-outline btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              openEditModal(row);
            }}
          >
            Edit
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
            style={{ color: 'var(--danger, #e63946)' }}
          >
            Delete
          </button>
        </span>
      ),
    },
  ];

  const openAddModal = () => {
    setEditTarget(null);
    setForm({ ...buildEmptyForm(), lineId });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditTarget(row);
    setForm({
      machineId: row.machine_id || '',
      lineId: row.line_id || '',
      stationId: row.station_id || '',
      location: row.location || '',
      machineType: row.machine_type || '',
      capacity: MACHINE_CAPACITY,
      currentStock: row.current_stock ?? 0,
      lowStockThreshold: row.low_stock_threshold ?? 10,
      installationDate: row.installation_date || '',
      status: row.status || 'ACTIVE',
      remark: row.remark || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleFormChange = (key, value) => {
    if (key === 'lineId') {
      setForm((prev) => ({ ...prev, lineId: value, stationId: '' }));
    } else {
      setForm((prev) => ({ ...prev, [key]: value }));
    }
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.machineId.trim()) errors.machineId = 'Machine ID is required';
    if (!form.lineId) errors.lineId = 'Please select a metro line';
    if (!form.stationId) errors.stationId = 'Please select a station';
    const currentStock = Number(form.currentStock);
    if (form.currentStock === '' || isNaN(currentStock) || currentStock < 0) {
      errors.currentStock = 'Current stock must be 0 or more';
    } else if (currentStock > MACHINE_CAPACITY) {
      errors.currentStock = `Current stock cannot exceed capacity (${MACHINE_CAPACITY})`;
    }
    const threshold = Number(form.lowStockThreshold);
    if (form.lowStockThreshold === '' || isNaN(threshold) || threshold < 0) {
      errors.lowStockThreshold = 'Low stock threshold must be 0 or more';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const payload = {
        machineId: form.machineId.trim(),
        stationId: form.stationId,
        lineId: form.lineId,
        location: form.location.trim(),
        machineType: form.machineType,
        capacity: MACHINE_CAPACITY,
        currentStock: Number(form.currentStock) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 0,
        installationDate: form.installationDate,
        status: form.status,
        remark: form.remark.trim(),
      };
      if (editTarget) {
        await machineService.update(editTarget.id, payload);
        addToast('Machine updated successfully', 'success');
      } else {
        await machineService.create(payload);
        addToast('Machine created successfully', 'success');
      }
      setModalOpen(false);
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await machineService.remove(deleteTarget.id);
      addToast('Machine deleted successfully', 'success');
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Machines</h1>
        </div>
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Machines</h1>
        <button className="btn btn-primary" onClick={openAddModal}>
          Add Machine
        </button>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        loading={linesLoading || filterStationsLoading || loading}
      />

      <DataTable
        columns={columns}
        data={machinesData?.machines || []}
        loading={loading}
        emptyMessage="No machines found"
        pagination={{
          currentPage: page,
          totalPages,
          totalItems,
          limit,
          onLimitChange: setLimit,
        }}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/machines/${row.id}`)}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Machine' : 'Add Machine'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Machine ID</label>
            <input
              type="text"
              className="form-input"
              value={form.machineId}
              onChange={(e) => handleFormChange('machineId', e.target.value)}
              placeholder="e.g. MH-0001"
            />
            {formErrors.machineId && (
              <span className="form-error">{formErrors.machineId}</span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Metro Line</label>
            <select
              className="form-select"
              value={form.lineId}
              onChange={(e) => handleFormChange('lineId', e.target.value)}
            >
              <option value="">Select a metro line</option>
              {lineOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {formErrors.lineId && <span className="form-error">{formErrors.lineId}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Station</label>
            <select
              className="form-select"
              value={form.stationId}
              onChange={(e) => handleFormChange('stationId', e.target.value)}
              disabled={!form.lineId}
            >
              <option value="">
                {form.lineId ? 'Select a station' : 'Select a metro line first'}
              </option>
              {modalStationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {formErrors.stationId && (
              <span className="form-error">{formErrors.stationId}</span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Machine Location</label>
            <input
              type="text"
              className="form-input"
              value={form.location}
              onChange={(e) => handleFormChange('location', e.target.value)}
              placeholder="e.g. Near Exit A"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Machine Type</label>
            <select
              className="form-select"
              value={form.machineType}
              onChange={(e) => handleFormChange('machineType', e.target.value)}
            >
              <option value="">Select a machine type</option>
              {MACHINE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Capacity</label>
            <input
              type="text"
              className="form-input"
              value={`${MACHINE_CAPACITY} pads (${SLOTS_PER_MACHINE} slots × ${SLOT_CAPACITY})`}
              readOnly
              disabled
            />
            <span className="form-hint">Fixed for every machine.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Current Stock</label>
            <input
              type="number"
              className="form-input"
              value={form.currentStock}
              onChange={(e) => handleFormChange('currentStock', e.target.value)}
              placeholder="e.g. 50"
              min="0"
            />
            {formErrors.currentStock && (
              <span className="form-error">{formErrors.currentStock}</span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Low Stock Threshold</label>
            <input
              type="number"
              className="form-input"
              value={form.lowStockThreshold}
              onChange={(e) => handleFormChange('lowStockThreshold', e.target.value)}
              placeholder="e.g. 10"
              min="0"
            />
            {formErrors.lowStockThreshold && (
              <span className="form-error">{formErrors.lowStockThreshold}</span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Installation Date</label>
            <input
              type="date"
              className="form-input"
              value={form.installationDate}
              onChange={(e) => handleFormChange('installationDate', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Machine Status</label>
            <select
              className="form-select"
              value={form.status}
              onChange={(e) => handleFormChange('status', e.target.value)}
            >
              {MACHINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Remark</label>
            <textarea
              className="form-textarea"
              value={form.remark}
              onChange={(e) => handleFormChange('remark', e.target.value)}
              placeholder="Enter any remarks"
              rows="2"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Machine"
        message={`Are you sure you want to delete machine "${deleteTarget?.machine_id}"? This action cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
      />
    </div>
  );
}

export default Machines;