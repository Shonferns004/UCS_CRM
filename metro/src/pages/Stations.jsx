import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import useToast from '../hooks/useToast.js';
import usePagination from '../hooks/usePagination.js';
import useDebounce from '../hooks/useDebounce.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import { getErrorMessage } from '../utils/formatters.js';
import { ENTITY_STATUSES, SLOTS_PER_MACHINE, SLOT_CAPACITY, MACHINE_CAPACITY } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LineBadge from '../components/LineBadge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorState from '../components/ErrorState.jsx';

const emptyForm = { name: '', stationCode: '', lineId: '', description: '' };

function Stations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit, reset } = usePagination();

  const [lineId, setLineId] = useState(searchParams.get('lineId') || '');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filterKey = JSON.stringify({ lineId, status, search: debouncedSearch });

  useEffect(() => {
    reset();
  }, [lineId, status, debouncedSearch, reset]);

  const params = useMemo(() => {
    const p = { page, limit };
    if (lineId) p.lineId = lineId;
    if (status) p.status = status;
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [lineId, status, debouncedSearch, page, limit]);

  const { data: linesData, loading: linesLoading } = useApi(
    () => metroLineService.getAll({ limit: 100 }),
    []
  );

  const lineOptions = useMemo(() => {
    const lines = linesData?.lines || [];
    return lines.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));
  }, [linesData]);

  const {
    data: stationsData,
    loading,
    error,
    refetch,
  } = useApi(() => stationService.getAll(params), [JSON.stringify(params)]);

  const meta = stationsData?.meta || {};
  const totalPages = meta.totalPages ?? meta.total_pages ?? 1;
  const totalItems = meta.totalItems ?? meta.total ?? 0;

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'lineId') setLineId(value);
    else if (key === 'status') setStatus(value);
    else if (key === 'search') setSearch(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setLineId('');
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
      key: 'status',
      type: 'select',
      value: status,
      label: 'All Statuses',
      options: ENTITY_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })),
    },
    { key: 'search', type: 'search', value: search, label: 'Search stations...' },
  ];

  const columns = [
    { key: 'station_code', label: 'Station ID' },
    { key: 'name', label: 'Station Name' },
    { key: 'line_name', label: 'Metro Line', render: (val, row) => <LineBadge name={val} code={row.line_code} size="sm" /> },
    { key: 'machine_count', label: 'Total Machines' },
    { key: 'active_machine_count', label: 'Active Machines' },
    { key: 'total_stock', label: 'Current Stock' },
    { key: 'last_refill', label: 'Last Refill', render: () => '—' },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} size="sm" /> },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <button
          className="btn btn-outline btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            openEditModal(row);
          }}
        >
          Edit
        </button>
      ),
    },
  ];

  const openAddModal = () => {
    setEditTarget(null);
    setForm({ ...emptyForm, lineId });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditTarget(row);
    setForm({
      name: row.name || '',
      stationCode: row.station_code || '',
      lineId: row.line_id || '',
      description: row.description || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Station name is required';
    if (!form.stationCode.trim()) errors.stationCode = 'Station code is required';
    if (!form.lineId) errors.lineId = 'Please select a metro line';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const payload = {
        lineId: form.lineId,
        stationCode: form.stationCode.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
      };
      if (editTarget) {
        await stationService.update(editTarget.id, payload);
        addToast('Station updated successfully', 'success');
      } else {
        await stationService.create(payload);
        addToast('Station created successfully', 'success');
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
      await stationService.remove(deleteTarget.id);
      addToast('Station deleted successfully', 'success');
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
          <h1 className="page-title">Stations</h1>
        </div>
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Stations</h1>
        <button className="btn btn-primary" onClick={openAddModal}>
          Add Station
        </button>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        loading={linesLoading || loading}
      />

      <DataTable
        columns={columns}
        data={stationsData?.stations || []}
        loading={loading}
        emptyMessage="No stations found"
        pagination={{
          currentPage: page,
          totalPages,
          totalItems,
          limit,
          onLimitChange: setLimit,
        }}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/stations/${row.id}`)}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Station' : 'Add Station'}
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
            <label className="form-label">Station Name</label>
            <input
              type="text"
              className="form-input"
              value={form.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              placeholder="Enter station name"
            />
            {formErrors.name && <span className="form-error">{formErrors.name}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Station Code</label>
            <input
              type="text"
              className="form-input"
              value={form.stationCode}
              onChange={(e) => handleFormChange('stationCode', e.target.value)}
              placeholder="e.g. ST-001"
            />
            {formErrors.stationCode && (
              <span className="form-error">{formErrors.stationCode}</span>
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
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={form.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              placeholder="Enter station description"
              rows="3"
            />
          </div>
          {!editTarget && (
            <p className="form-hint">
              A machine with {SLOTS_PER_MACHINE} slots of {SLOT_CAPACITY} pads ({MACHINE_CAPACITY} total) is created automatically for this station.
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Station"
        message={`Are you sure you want to delete station "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
      />
    </div>
  );
}

export default Stations;