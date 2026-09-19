import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import usePagination from '../hooks/usePagination.js';
import useDebounce from '../hooks/useDebounce.js';
import useToast from '../hooks/useToast.js';
import * as metroLineService from '../services/metroLine.service.js';
import { getErrorMessage } from '../utils/formatters.js';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ErrorState from '../components/ErrorState.jsx';

function MetroLines() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit, reset } = usePagination(1, 20);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingLine, setDeletingLine] = useState(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [statusToggleLine, setStatusToggleLine] = useState(null);

  const params = useMemo(
    () => ({
      page,
      limit,
      search: debouncedSearch || undefined,
      status: statusFilter || undefined,
    }),
    [page, limit, debouncedSearch, statusFilter]
  );

  const paramKey = JSON.stringify(params);

  const { data, loading, error, refetch } = useApi(
    () => metroLineService.getAll(params),
    [paramKey]
  );

  const lines = data?.lines || [];
  const meta = data?.meta || { page: 1, limit: 20, total: 0, totalPages: 0 };

  const handleFilterChange = useCallback(
    (key, value) => {
      if (key === 'search') {
        setSearch(value);
        setPage(1);
      } else if (key === 'status') {
        setStatusFilter(value);
        setPage(1);
      }
    },
    [setPage]
  );

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  }, [setPage]);

  const filters = [
    {
      key: 'search',
      type: 'search',
      value: search,
      label: 'Search metro lines...',
    },
    {
      key: 'status',
      type: 'select',
      value: statusFilter,
      label: 'All Statuses',
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' },
      ],
    },
  ];

  const openAddModal = () => {
    setEditingLine(null);
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setModalOpen(true);
  };

  const openEditModal = (line) => {
    setEditingLine(line);
    setFormName(line.name || '');
    setFormCode(line.code || '');
    setFormDescription(line.description || '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingLine(null);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCode.trim()) {
      addToast('Line name and code are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        code: formCode.trim(),
        description: formDescription.trim(),
      };
      if (editingLine) {
        await metroLineService.update(editingLine.id, payload);
        addToast('Metro line updated successfully', 'success');
      } else {
        await metroLineService.create(payload);
        addToast('Metro line created successfully', 'success');
      }
      closeModal();
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (line, e) => {
    e.stopPropagation();
    setDeletingLine(line);
    setConfirmDelete(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingLine) return;
    try {
      await metroLineService.remove(deletingLine.id);
      addToast('Metro line deleted successfully', 'success');
      setConfirmDelete(false);
      setDeletingLine(null);
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleStatusClick = (line, e) => {
    e.stopPropagation();
    setStatusToggleLine(line);
    setConfirmStatus(true);
  };

  const handleStatusConfirm = async () => {
    if (!statusToggleLine) return;
    const newStatus =
      statusToggleLine.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await metroLineService.updateStatus(statusToggleLine.id, newStatus);
      addToast(
        `Metro line ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`,
        'success'
      );
      setConfirmStatus(false);
      setStatusToggleLine(null);
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleRowClick = (row) => {
    navigate(`/stations?lineId=${row.id}`);
  };

  const columns = [
    {
      key: 'code',
      label: 'Line ID',
      sortable: true,
    },
    {
      key: 'name',
      label: 'Line Name',
      sortable: true,
    },
    {
      key: 'station_count',
      label: 'Stations',
    },
    {
      key: 'machine_count',
      label: 'Machines',
    },
    {
      key: 'active_machine_count',
      label: 'Active Machines',
    },
    {
      key: 'inactive_machine_count',
      label: 'Inactive Machines',
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <StatusBadge status={val} size="sm" />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="actions-bar">
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
            onClick={(e) => handleStatusClick(row, e)}
          >
            {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={(e) => handleDeleteClick(row, e)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const pagination = {
    currentPage: meta.page || page,
    totalPages: meta.totalPages || 1,
    totalItems: meta.total || 0,
    limit: meta.limit || limit,
    onLimitChange: (newLimit) => {
      setLimit(newLimit);
      setPage(1);
    },
  };

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Metro Lines</h1>
        </div>
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Metro Lines</h1>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Add Metro Line
        </button>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        loading={loading}
      />

      <div className="card">
        <DataTable
          columns={columns}
          data={lines}
          loading={loading}
          emptyMessage="No metro lines found"
          onRowClick={handleRowClick}
          pagination={pagination}
          onPageChange={setPage}
        />
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingLine ? 'Edit Metro Line' : 'Add Metro Line'}
        size="md"
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : editingLine ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Line Name *</label>
          <input
            type="text"
            className="form-input"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Enter line name"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Line Code *</label>
          <input
            type="text"
            className="form-input"
            value={formCode}
            onChange={(e) => setFormCode(e.target.value)}
            placeholder="Enter line code"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-textarea"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Enter description"
            rows={3}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setDeletingLine(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Metro Line"
        message={`Are you sure you want to delete "${deletingLine?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      <ConfirmDialog
        isOpen={confirmStatus}
        onClose={() => {
          setConfirmStatus(false);
          setStatusToggleLine(null);
        }}
        onConfirm={handleStatusConfirm}
        title={`${statusToggleLine?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} Metro Line`}
        message={`Are you sure you want to ${statusToggleLine?.status === 'ACTIVE' ? 'deactivate' : 'activate'} "${statusToggleLine?.name}"?`}
        confirmLabel={statusToggleLine?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        confirmVariant={statusToggleLine?.status === 'ACTIVE' ? 'danger' : 'primary'}
      />
    </div>
  );
}

export default MetroLines;
