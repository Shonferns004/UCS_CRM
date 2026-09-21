import React, { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import * as machineService from '../services/machine.service.js';
import * as refillService from '../services/refill.service.js';
import * as stockIssueService from '../services/stockIssue.service.js';
import * as maintenanceService from '../services/maintenance.service.js';
import { formatDate, formatDateTime, getErrorMessage } from '../utils/formatters.js';
import { MACHINE_STATUSES, SLOTS_PER_MACHINE, SLOT_CAPACITY } from '../utils/constants.js';
import StatusBadge from '../components/StatusBadge.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import EmptyState from '../components/EmptyState.jsx';

const TABS = ['Overview', 'Refills', 'Stock History', 'Status History', 'Issues', 'Maintenance'];

function MachineDetail() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('Overview');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const { data: machine, loading, error, refetch: refetchMachine } = useApi(
    () => machineService.getById(id),
    [id]
  );

  const requiresReason = ['INACTIVE', 'OFFLINE', 'MAINTENANCE'].includes(newStatus);

  const handleStatusChange = useCallback(async () => {
    if (!newStatus) return;
    if (requiresReason && !statusReason.trim()) return;
    setStatusSaving(true);
    try {
      await machineService.changeStatus(id, newStatus, statusReason.trim());
      addToast('Status updated successfully', 'success');
      setShowStatusModal(false);
      setNewStatus('');
      setStatusReason('');
      refetchMachine();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setStatusSaving(false);
    }
  }, [id, newStatus, statusReason, requiresReason, addToast, refetchMachine]);

  const refillColumns = [
    { key: 'refill_date', label: 'Date', render: (val) => formatDate(val) },
    { key: 'previous_stock', label: 'Previous' },
    { key: 'refill_quantity', label: 'Refilled' },
    { key: 'new_stock', label: 'New' },
    { key: 'refilled_by', label: 'By' },
    { key: 'remark', label: 'Remark' },
  ];

  const statusHistoryColumns = [
    { key: 'changed_at', label: 'Date', render: (val) => formatDateTime(val) },
    { key: 'previous_status', label: 'Previous', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'new_status', label: 'New', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'reason', label: 'Reason' },
    { key: 'changed_by_name', label: 'Changed By' },
  ];

  const issueColumns = [
    { key: 'report_date', label: 'Date', render: (val) => formatDate(val) },
    { key: 'issue_type', label: 'Type' },
    { key: 'missing_quantity', label: 'Missing', render: (val) => <span style={val > 0 ? { color: 'red', fontWeight: 'bold' } : {}}>{val}</span> },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'reason', label: 'Reason' },
  ];

  const maintenanceColumns = [
    { key: 'reported_date', label: 'Date', render: (val) => formatDate(val) },
    { key: 'problem', label: 'Problem' },
    { key: 'priority', label: 'Priority', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'technician', label: 'Technician' },
  ];

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'Refills':
        return <RefillsTab machineId={id} page={page} limit={limit} setPage={setPage} setLimit={setLimit} columns={refillColumns} />;
      case 'Stock History':
        return <RefillsTab machineId={id} page={page} limit={limit} setPage={setPage} setLimit={setLimit} columns={refillColumns} title="Stock History" />;
      case 'Status History':
        return <StatusHistoryTab machineId={id} columns={statusHistoryColumns} />;
      case 'Issues':
        return <IssuesTab machineId={id} page={page} limit={limit} setPage={setPage} setLimit={setLimit} columns={issueColumns} />;
      case 'Maintenance':
        return <MaintenanceTab machineId={id} page={page} limit={limit} setPage={setPage} setLimit={setLimit} columns={maintenanceColumns} />;
      default:
        return null;
    }
  }, [activeTab, id, page, limit]);

  if (loading) return <LoadingSpinner message="Loading machine details..." fullPage />;

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <Link to="/machines" className="btn btn-secondary btn-sm">Back to Machines</Link>
          <h1 className="page-title">Machine Not Found</h1>
        </div>
        <EmptyState icon="❌" message={getErrorMessage(error)} actionLabel="Go Back" onAction={() => window.history.back()} />
      </div>
    );
  }

  if (!machine) return null;

  const slots = machine.slots ?? Array.from({ length: SLOTS_PER_MACHINE }, (_, i) => {
    const stock = Math.max(
      0,
      Math.min(SLOT_CAPACITY, (machine.current_stock ?? 0) - i * SLOT_CAPACITY)
    );
    return { slot: i + 1, capacity: SLOT_CAPACITY, stock };
  });

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <Link to="/machines" className="btn btn-secondary btn-sm">← Back</Link>
        <h1 className="page-title" style={{ margin: 0 }}>Machine {machine.machine_id}</h1>
        <StatusBadge status={machine.status} />
        {hasRole('ADMIN', 'OPERATIONS') && (
          <button className="btn btn-outline btn-sm" onClick={() => setShowStatusModal(true)} style={{ marginLeft: 'auto' }}>
            Change Status
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">STOCK LEVEL</h2>
          <span>{machine.current_stock ?? 0} / {machine.capacity ?? 0}</span>
        </div>
        <div className="card-body">
          <div className="stock-bar">
            <div
              className={`stock-bar-fill ${(machine.stock_percentage ?? 0) <= 20 ? 'stock-low' : ''}`}
              style={{ width: `${machine.stock_percentage ?? 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">SLOTS</h2>
          <span>{SLOTS_PER_MACHINE} slots × {SLOT_CAPACITY} pads</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {slots.map((s) => (
              <div
                key={s.slot}
                style={{
                  flex: '1 1 140px',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
                  <span>Slot {s.slot}</span>
                  <span>{s.stock} / {s.capacity}</span>
                </div>
                <div className="stock-bar" style={{ marginTop: '8px' }}>
                  <div
                    className={`stock-bar-fill ${s.stock === 0 ? 'stock-low' : ''}`}
                    style={{ width: `${s.capacity ? (s.stock / s.capacity) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => { setActiveTab(tab); setPage(1); }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' ? (
        <OverviewTab machine={machine} />
      ) : (
        tabContent
      )}

      <Modal
        isOpen={showStatusModal}
        onClose={() => { setShowStatusModal(false); setNewStatus(''); setStatusReason(''); }}
        title="Change Machine Status"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setShowStatusModal(false); setNewStatus(''); setStatusReason(''); }}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleStatusChange}
              disabled={!newStatus || statusSaving || (requiresReason && !statusReason.trim())}
            >
              {statusSaving ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">New Status</label>
          <select
            className="form-select"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
          >
            <option value="">Select status</option>
            {MACHINE_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        {requiresReason && (
          <div className="form-group">
            <label className="form-label">Reason (required)</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Enter reason for this status change..."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function OverviewTab({ machine }) {
  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">MACHINE DETAILS</h2>
        </div>
        <div className="card-body">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Machine ID</span>
              <span className="info-value">{machine.machine_id}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Status</span>
              <span className="info-value"><StatusBadge status={machine.status} /></span>
            </div>
            <div className="info-item">
              <span className="info-label">Metro Line</span>
              <span className="info-value">{machine.line_name} ({machine.line_code})</span>
            </div>
            <div className="info-item">
              <span className="info-label">Station</span>
              <span className="info-value">{machine.station_name} ({machine.station_code})</span>
            </div>
            <div className="info-item">
              <span className="info-label">Location</span>
              <span className="info-value">{machine.location}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Machine Type</span>
              <span className="info-value">{machine.machine_type}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Capacity</span>
              <span className="info-value">{machine.capacity} ({SLOTS_PER_MACHINE} slots × {SLOT_CAPACITY})</span>
            </div>
            <div className="info-item">
              <span className="info-label">Current Stock</span>
              <span className="info-value">{machine.current_stock}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Stock Percentage</span>
              <span className="info-value">{machine.stock_percentage}%</span>
            </div>
            <div className="info-item">
              <span className="info-label">Installation Date</span>
              <span className="info-value">{formatDate(machine.installation_date)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Last Refill</span>
              <span className="info-value">{formatDate(machine.last_refill_at)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Last Maintenance</span>
              <span className="info-value">{formatDate(machine.last_maintenance_at)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Remark</span>
              <span className="info-value">{machine.remark || '—'}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="kpi-grid">
        <KpiCard title="Total Refills" value={machine.refill_count ?? 0} icon="🔄" color="primary" />
        <KpiCard title="Total Issues" value={machine.issue_count ?? 0} icon="⚠️" color="warning" />
        <KpiCard title="Maintenance Records" value={machine.maintenance_count ?? 0} icon="🔧" color="info" />
      </div>
    </>
  );
}

function RefillsTab({ machineId, page, limit, setPage, setLimit, columns, title }) {
  const { data, loading } = useApi(
    () => refillService.getByMachine(machineId, { page, limit }),
    [machineId, page, limit]
  );

  const refills = data?.refills || [];
  const meta = data?.meta || {};

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{(title || 'REFILL').toUpperCase()}</h2>
      </div>
      <DataTable
        columns={columns}
        data={refills}
        loading={loading}
        emptyMessage={`No ${title ? title.toLowerCase() : 'refill'} records found`}
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
  );
}

function StatusHistoryTab({ machineId, columns }) {
  const { data, loading } = useApi(
    () => machineService.getStatusHistory(machineId),
    [machineId]
  );

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">STATUS HISTORY</h2>
      </div>
      <DataTable
        columns={columns}
        data={data || []}
        loading={loading}
        emptyMessage="No status history found"
      />
    </div>
  );
}

function IssuesTab({ machineId, page, limit, setPage, setLimit, columns }) {
  const { data, loading } = useApi(
    () => stockIssueService.getByMachine(machineId, { page, limit }),
    [machineId, page, limit]
  );

  const issues = data?.issues || [];
  const meta = data?.meta || {};

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">STOCK ISSUES</h2>
      </div>
      <DataTable
        columns={columns}
        data={issues}
        loading={loading}
        emptyMessage="No stock issues found"
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
  );
}

function MaintenanceTab({ machineId, page, limit, setPage, setLimit, columns }) {
  const { data, loading } = useApi(
    () => maintenanceService.getByMachine(machineId, { page, limit }),
    [machineId, page, limit]
  );

  const items = data?.maintenance || [];
  const meta = data?.meta || {};

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">MAINTENANCE</h2>
      </div>
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage="No maintenance records found"
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
  );
}

export default MachineDetail;
