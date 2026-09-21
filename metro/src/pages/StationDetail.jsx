import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import useToast from '../hooks/useToast.js';
import useAuth from '../hooks/useAuth.js';
import * as stationService from '../services/station.service.js';
import * as metroLineService from '../services/metroLine.service.js';
import { getErrorMessage, formatDate, getStockLevel } from '../utils/formatters.js';
import { MACHINE_CAPACITY } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import KpiCard from '../components/KpiCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LineBadge from '../components/LineBadge.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorState from '../components/ErrorState.jsx';

function stockBarClass(row) {
  if (Number(row.stock_percentage) <= 0 || row.current_stock === 0) {
    return 'stock-empty';
  }
  const level = getStockLevel(row.current_stock, row.low_stock_threshold);
  if (level === 'LOW_STOCK') return 'stock-low';
  return 'stock-normal';
}

function StationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN', 'OPERATIONS');

  const [activeTab, setActiveTab] = useState('refills');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const {
    data: station,
    loading,
    error,
    refetch,
  } = useApi(() => stationService.getById(id), [id]);

  const { data: linesData } = useApi(
    () => metroLineService.getAll({ limit: 100 }),
    []
  );

  const lineOptions = useMemo(() => {
    const lines = linesData?.lines || [];
    return lines.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));
  }, [linesData]);

  const lowStockCount = useMemo(() => {
    const machines = station?.machines || [];
    return machines.filter(
      (m) =>
        m.status === 'ACTIVE' &&
        Number(m.current_stock) <= Number(m.low_stock_threshold)
    ).length;
  }, [station]);

  const machineColumns = [
    {
      key: 'machine_id',
      label: 'Machine ID',
      render: (val, row) => (
        <Link
          to={`/machines/${row.machine_id || row.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {val || row.machine_code}
        </Link>
      ),
    },
    { key: 'location', label: 'Location' },
    {
      key: 'stock',
      label: 'Stock',
      render: (_, row) => (
        <div className="stock-percentage-cell">
          <div className="stock-bar">
            <div
              className={`stock-bar-fill ${stockBarClass(row)}`}
              style={{
                width: `${Math.min(100, Math.max(0, Number(row.stock_percentage) || 0))}%`,
              }}
            />
          </div>
          <span>{(row.current_stock ?? 0)} of {row.capacity ?? MACHINE_CAPACITY}</span>
        </div>
      ),
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
    { key: 'remark', label: 'Remark', render: (val) => val || '—' },
    {
      key: 'view',
      label: 'Action',
      render: (_, row) => (
        <Link
          to={`/machines/${row.machine_id || row.id}`}
          className="btn btn-outline btn-sm"
          onClick={(e) => e.stopPropagation()}
        >
          View
        </Link>
      ),
    },
  ];

  const refillColumns = [
    { key: 'refill_date', label: 'Date', render: (val) => formatDate(val) || '—' },
    { key: 'machine_code', label: 'Machine' },
    { key: 'previous_stock', label: 'Prev' },
    { key: 'refill_quantity', label: 'Refilled' },
    { key: 'new_stock', label: 'New' },
    { key: 'refilled_by', label: 'By' },
  ];

  const issueColumns = [
    { key: 'report_date', label: 'Date', render: (val) => formatDate(val) || '—' },
    { key: 'machine_code', label: 'Machine' },
    { key: 'issue_type', label: 'Type' },
    { key: 'missing_quantity', label: 'Missing' },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} size="sm" /> },
  ];

  const maintenanceColumns = [
    { key: 'reported_date', label: 'Date', render: (val) => formatDate(val) || '—' },
    { key: 'machine_code', label: 'Machine' },
    { key: 'problem', label: 'Problem' },
    { key: 'priority', label: 'Priority', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} size="sm" /> },
  ];

  const tabs = [
    { key: 'refills', label: 'Refill History' },
    { key: 'issues', label: 'Stock Issues' },
    { key: 'maintenance', label: 'Maintenance' },
  ];

  const openEditModal = () => {
    setForm({
      name: station?.name || '',
      stationCode: station?.station_code || '',
      lineId: station?.line_id || '',
      description: station?.description || '',
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
    if (!form?.name?.trim()) errors.name = 'Station name is required';
    if (!form?.stationCode?.trim()) errors.stationCode = 'Station code is required';
    if (!form?.lineId) errors.lineId = 'Please select a metro line';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form || !validateForm()) return;
    setSubmitting(true);
    try {
      await stationService.update(id, {
        lineId: form.lineId,
        stationCode: form.stationCode.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
      });
      addToast('Station updated successfully', 'success');
      setModalOpen(false);
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading station..." fullPage />;
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Station {station?.name}</h1>
        <div className="actions-bar">
          <Link to="/stations" className="btn btn-outline">
            ← Back to Stations
          </Link>
          {canManage && (
            <button className="btn btn-secondary" onClick={openEditModal}>
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Station Information</h2>
        </div>
        <div className="card-body">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Station ID</span>
              <span className="info-value">{station?.station_code || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Station Name</span>
              <span className="info-value">{station?.name || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Station Code</span>
              <span className="info-value">{station?.station_code || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Metro Line</span>
              <span className="info-value"><LineBadge name={station?.line_name} code={station?.line_code} /></span>
            </div>
            <div className="info-item">
              <span className="info-label">Status</span>
              <StatusBadge status={station?.status} />
            </div>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          title="Total Machines"
          value={station?.machine_count ?? 0}
          icon="🖥️"
          color="primary"
          subtitle="Machines"
        />
        <KpiCard
          title="Active"
          value={station?.active_machine_count ?? 0}
          icon="🟢"
          color="success"
          subtitle="Active"
        />
        <KpiCard
          title="Inactive"
          value={station?.inactive_machine_count ?? 0}
          icon="🔴"
          color="danger"
          subtitle="Inactive"
        />
        <KpiCard
          title="Low Stock"
          value={lowStockCount}
          icon="🟠"
          color="warning"
          subtitle="Low stock"
        />
        <KpiCard
          title="Maintenance"
          value={station?.maintenance_machine_count ?? 0}
          icon="🛠️"
          color="orange"
          subtitle="Under maintenance"
        />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Station Machines</h2>
        </div>
        <div className="card-body">
          <DataTable
            columns={machineColumns}
            data={station?.machines || []}
            loading={loading}
            emptyMessage="No machines at this station"
            onRowClick={(row) => navigate(`/machines/${row.machine_id || row.id}`)}
          />
        </div>
      </div>

      <div className="card">
        <div className="tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="card-body">
          {activeTab === 'refills' && (
            <DataTable
              columns={refillColumns}
              data={station?.recent_refills || []}
              emptyMessage="No refill history"
            />
          )}
          {activeTab === 'issues' && (
            <DataTable
              columns={issueColumns}
              data={station?.recent_issues || []}
              emptyMessage="No stock issues"
            />
          )}
          {activeTab === 'maintenance' && (
            <DataTable
              columns={maintenanceColumns}
              data={station?.recent_maintenance || []}
              emptyMessage="No maintenance records"
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Edit Station"
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
              value={form?.name || ''}
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
              value={form?.stationCode || ''}
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
              value={form?.lineId || ''}
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
              value={form?.description || ''}
              onChange={(e) => handleFormChange('description', e.target.value)}
              placeholder="Enter station description"
              rows="3"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default StationDetail;