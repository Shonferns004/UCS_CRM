import React, { useState, useMemo, useCallback, useEffect } from 'react';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import usePagination from '../hooks/usePagination.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as machineService from '../services/machine.service.js';
import * as stockIssueService from '../services/stockIssue.service.js';
import { formatDate, getErrorMessage } from '../utils/formatters.js';
import { ISSUE_TYPES, ISSUE_STATUSES } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

function StockIssues() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit, reset } = usePagination();

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [status, setStatus] = useState('');
  const [issueType, setIssueType] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [updateModalRow, setUpdateModalRow] = useState(null);

  useEffect(() => { reset(); }, [lineId, stationId, machineId, status, issueType]);

  const filterParams = useMemo(() => {
    const p = { page, limit };
    if (lineId) p.lineId = lineId;
    if (stationId) p.stationId = stationId;
    if (machineId) p.machineId = machineId;
    if (status) p.status = status;
    if (issueType) p.issueType = issueType;
    return p;
  }, [page, limit, lineId, stationId, machineId, status, issueType]);

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

  const { data: issuesData, loading, refetch } = useApi(
    () => stockIssueService.getAll(filterParams),
    [filterKey]
  );

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'lineId') { setLineId(value); setStationId(''); setMachineId(''); }
    else if (key === 'stationId') { setStationId(value); setMachineId(''); }
    else if (key === 'machineId') setMachineId(value);
    else if (key === 'status') setStatus(value);
    else if (key === 'issueType') setIssueType(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setLineId(''); setStationId(''); setMachineId(''); setStatus(''); setIssueType('');
  }, []);

  const filters = [
    { key: 'lineId', type: 'select', value: lineId, label: 'All Metro Lines', options: lineOptions },
    { key: 'stationId', type: 'select', value: stationId, label: 'All Stations', options: stationOptions },
    { key: 'machineId', type: 'select', value: machineId, label: 'All Machines', options: machineOptions },
    { key: 'status', type: 'select', value: status, label: 'All Statuses', options: ISSUE_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
    { key: 'issueType', type: 'select', value: issueType, label: 'All Types', options: ISSUE_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) })) },
  ];

  const columns = [
    { key: 'report_date', label: 'Date', render: (val) => formatDate(val) },
    { key: 'line_name', label: 'Line' },
    { key: 'station_name', label: 'Station' },
    { key: 'machine_code', label: 'Machine' },
    { key: 'expected_stock', label: 'Expected' },
    { key: 'actual_stock', label: 'Actual' },
    {
      key: 'missing_quantity', label: 'Missing',
      render: (val) => <span style={val > 0 ? { color: 'red', fontWeight: 'bold' } : {}}>{val}</span>,
    },
    {
      key: 'issue_type', label: 'Type',
      render: (val) => val ? val.replace(/_/g, ' ') : '',
    },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'reported_by', label: 'Reported By' },
    {
      key: 'action', label: 'Action',
      render: (_, row) => (
        <button
          className="btn btn-outline btn-sm"
          onClick={(e) => { e.stopPropagation(); setUpdateModalRow(row); }}
        >
          Update Status
        </button>
      ),
    },
  ];

  const issues = issuesData?.issues || [];
  const meta = issuesData?.meta || {};

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">Pad Stock & Issues</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>+ Report Issue</button>
      </div>

      <FilterBar filters={filters} onChange={handleFilterChange} onClear={handleClearFilters} loading={loading} />

      <div className="card">
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

      <ReportIssueModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { setShowCreateModal(false); refetch(); }}
        userName={user?.name || ''}
        lineOptions={lineOptions}
      />

      {updateModalRow && (
        <UpdateStatusModal
          isOpen={!!updateModalRow}
          onClose={() => setUpdateModalRow(null)}
          onUpdated={() => refetch()}
          issue={updateModalRow}
        />
      )}
    </div>
  );
}

function ReportIssueModal({ isOpen, onClose, onSuccess, userName, lineOptions }) {
  const { addToast } = useToast();

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedStock, setExpectedStock] = useState('');
  const [actualStock, setActualStock] = useState('');
  const [issueType, setIssueType] = useState('');
  const [reason, setReason] = useState('');
  const [reportedBy, setReportedBy] = useState(userName || '');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!reportedBy && userName) setReportedBy(userName);
  }, [userName, reportedBy]);

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
    return machinesData.machines.map((m) => ({ value: m.id, label: `${m.machine_id} (Stock: ${m.current_stock})` }));
  }, [machinesData]);

  const { data: machineDetail } = useApi(
    () => (machineId ? machineService.getById(machineId) : Promise.resolve(null)),
    [machineId]
  );

  useEffect(() => {
    if (machineDetail) setSelectedMachine(machineDetail);
  }, [machineDetail]);

  const expected = Number(expectedStock) || 0;
  const actual = Number(actualStock) || 0;
  const missing = expected - actual;
  const missingNegative = missing < 0;

  const resetForm = () => {
    setLineId(''); setStationId(''); setMachineId(''); setSelectedMachine(null);
    setReportDate(new Date().toISOString().slice(0, 10));
    setExpectedStock(''); setActualStock(''); setIssueType('');
    setReason(''); setReportedBy(userName || ''); setRemark('');
    setErrors({});
  };

  const handleSave = async () => {
    const newErrors = {};
    if (!machineId) newErrors.machineId = 'Please select a machine';
    if (!reportDate) newErrors.reportDate = 'Date is required';
    if (expectedStock === '' || Number(expectedStock) < 0) newErrors.expectedStock = 'Expected stock is required';
    if (actualStock === '' || Number(actualStock) < 0) newErrors.actualStock = 'Actual stock is required';
    if (!issueType) newErrors.issueType = 'Please select an issue type';
    if (!reason) newErrors.reason = 'Please describe the issue';
    if (missingNegative) newErrors.actualStock = 'Actual stock cannot be greater than expected';

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      await stockIssueService.create({
        machineId,
        stationId,
        reportDate,
        expectedStock: expected,
        actualStock: actual,
        missingQuantity: missing,
        issueType,
        reason,
        status: 'OPEN',
        reportedBy: reportedBy || userName || 'Staff',
        remark,
      });
      addToast('Issue reported successfully', 'success');
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
      title="Report Stock Issue"
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { resetForm(); onClose(); }}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Submit Report'}
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
          <span className="info-label">Current Stock: </span>
          <span className="info-value">{selectedMachine.current_stock} / {selectedMachine.capacity}</span>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Report Date</label>
        <input type="date" className="form-input" value={reportDate} onChange={(e) => { setReportDate(e.target.value); setErrors((prev) => ({ ...prev, reportDate: undefined })); }} />
        {errors.reportDate && <span className="form-error">{errors.reportDate}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Expected Stock</label>
        <input type="number" className="form-input" min={0} value={expectedStock} onChange={(e) => { setExpectedStock(e.target.value); setErrors((prev) => ({ ...prev, expectedStock: undefined })); }} />
        {errors.expectedStock && <span className="form-error">{errors.expectedStock}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Actual Stock</label>
        <input type="number" className="form-input" min={0} value={actualStock} onChange={(e) => { setActualStock(e.target.value); setErrors((prev) => ({ ...prev, actualStock: undefined })); }} />
        {errors.actualStock && <span className="form-error">{errors.actualStock}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Missing Quantity</label>
        <input type="text" className="form-input" value={missingNegative ? 'N/A' : missing} disabled />
        {missingNegative && <span className="form-error">Missing quantity cannot be negative</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Issue Type</label>
        <select className="form-select" value={issueType} onChange={(e) => { setIssueType(e.target.value); setErrors((prev) => ({ ...prev, issueType: undefined })); }}>
          <option value="">Select type</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
        {errors.issueType && <span className="form-error">{errors.issueType}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Reason</label>
        <textarea className="form-textarea" rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setErrors((prev) => ({ ...prev, reason: undefined })); }} placeholder="Describe the issue..." />
        {errors.reason && <span className="form-error">{errors.reason}</span>}
      </div>
      <div className="form-group">
        <label className="form-label">Reported By</label>
        <input type="text" className="form-input" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Remark</label>
        <textarea className="form-textarea" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </div>
    </Modal>
  );
}

function UpdateStatusModal({ isOpen, onClose, onUpdated, issue }) {
  const { addToast } = useToast();
  const [newStatus, setNewStatus] = useState(issue?.status || '');
  const [saving, setSaving] = useState(false);

  const handleUpdate = async () => {
    if (!newStatus || newStatus === issue.status) return;
    setSaving(true);
    try {
      await stockIssueService.updateStatus(issue.id, newStatus);
      addToast('Issue status updated', 'success');
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update Issue Status"
      size="sm"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUpdate} disabled={saving || !newStatus || newStatus === issue.status}>
            {saving ? 'Updating...' : 'Update'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Current Status</label>
        <div><StatusBadge status={issue.status} /></div>
      </div>
      <div className="form-group">
        <label className="form-label">New Status</label>
        <select className="form-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
          {ISSUE_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

export default StockIssues;
