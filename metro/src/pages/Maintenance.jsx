import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import usePagination from '../hooks/usePagination.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as machineService from '../services/machine.service.js';
import * as maintenanceService from '../services/maintenance.service.js';
import { formatDate, getErrorMessage } from '../utils/formatters.js';
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

function Maintenance() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit, reset } = usePagination();

  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editRow, setEditRow] = useState(null);

  useEffect(() => { reset(); }, [lineId, stationId, machineId, status, priority]);

  const filterParams = useMemo(() => {
    const p = { page, limit };
    if (lineId) p.lineId = lineId;
    if (stationId) p.stationId = stationId;
    if (machineId) p.machineId = machineId;
    if (status) p.status = status;
    if (priority) p.priority = priority;
    return p;
  }, [page, limit, lineId, stationId, machineId, status, priority]);

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

  const { data: maintenanceData, loading } = useApi(
    () => maintenanceService.getAll(filterParams),
    [filterKey]
  );

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'lineId') { setLineId(value); setStationId(''); setMachineId(''); }
    else if (key === 'stationId') { setStationId(value); setMachineId(''); }
    else if (key === 'machineId') setMachineId(value);
    else if (key === 'status') setStatus(value);
    else if (key === 'priority') setPriority(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setLineId(''); setStationId(''); setMachineId(''); setStatus(''); setPriority('');
  }, []);

  const filters = [
    { key: 'lineId', type: 'select', value: lineId, label: 'All Metro Lines', options: lineOptions },
    { key: 'stationId', type: 'select', value: stationId, label: 'All Stations', options: stationOptions },
    { key: 'machineId', type: 'select', value: machineId, label: 'All Machines', options: machineOptions },
    { key: 'status', type: 'select', value: status, label: 'All Statuses', options: MAINTENANCE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) })) },
    { key: 'priority', type: 'select', value: priority, label: 'All Priorities', options: MAINTENANCE_PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() })) },
  ];

  const columns = [
    { key: 'reported_date', label: 'Date', render: (val) => formatDate(val) },
    { key: 'machine_code', label: 'Machine' },
    { key: 'station_name', label: 'Station' },
    { key: 'problem', label: 'Problem' },
    { key: 'priority', label: 'Priority', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'technician', label: 'Technician' },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'resolved_date', label: 'Resolved', render: (val) => formatDate(val) || '—' },
    {
      key: 'action', label: 'Action',
      render: (_, row) => (
        <button
          className="btn btn-outline btn-sm"
          onClick={(e) => { e.stopPropagation(); setEditRow(row); }}
        >
          Edit
        </button>
      ),
    },
  ];

  const rows = maintenanceData?.maintenance || [];
  const meta = maintenanceData?.meta || {};

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">Maintenance</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>Report Issue</button>
      </div>

      <FilterBar filters={filters} onChange={handleFilterChange} onClear={handleClearFilters} loading={loading} />

      <div className="card">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          emptyMessage="No maintenance records found"
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

      <MaintenanceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => setShowCreateModal(false)}
        lineOptions={lineOptions}
        userName={user?.name || ''}
      />

      {editRow && (
        <MaintenanceModal
          isOpen={!!editRow}
          onClose={() => setEditRow(null)}
          onSuccess={() => setEditRow(null)}
          lineOptions={lineOptions}
          userName={user?.name || ''}
          editData={editRow}
        />
      )}
    </div>
  );
}

function MaintenanceModal({ isOpen, onClose, onSuccess, lineOptions, userName, editData }) {
  const { addToast } = useToast();
  const isEdit = !!editData;

  const [lineId, setLineId] = useState(editData?.line_id || '');
  const [stationId, setStationId] = useState(editData?.station_id || '');
  const [machineId, setMachineId] = useState(editData?.machine_id || '');
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [problem, setProblem] = useState(editData?.problem || '');
  const [reportedDate, setReportedDate] = useState(editData?.reported_date ? editData.reported_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState(editData?.priority || 'MEDIUM');
  const [technician, setTechnician] = useState(editData?.technician || '');
  const [statusVal, setStatusVal] = useState(editData?.status || 'OPEN');
  const [remark, setRemark] = useState(editData?.remark || '');
  const [resolvedDate, setResolvedDate] = useState(editData?.resolved_date ? editData.resolved_date.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  const showResolved = statusVal === 'RESOLVED' || statusVal === 'CLOSED';

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
    () => (machineId && !selectedMachine ? machineService.getById(machineId) : Promise.resolve(null)),
    [machineId]
  );

  useEffect(() => {
    if (machineDetail) setSelectedMachine(machineDetail);
  }, [machineDetail]);

  const resetForm = () => {
    setLineId(''); setStationId(''); setMachineId(''); setSelectedMachine(null);
    setProblem(''); setReportedDate(new Date().toISOString().slice(0, 10));
    setPriority('MEDIUM'); setTechnician(''); setStatusVal('OPEN');
    setRemark(''); setResolvedDate('');
  };

  const handleSave = async () => {
    if (!machineId || !problem.trim()) return;

    setSaving(true);
    try {
      const payload = {
        machineId,
        stationId,
        problem: problem.trim(),
        reportedDate,
        priority,
        technician: technician.trim(),
        status: statusVal,
        remark,
      };
      if (showResolved && resolvedDate) {
        payload.resolvedDate = resolvedDate;
      }

      if (isEdit) {
        await maintenanceService.update(editData.id, payload);
        addToast('Maintenance record updated', 'success');
      } else {
        await maintenanceService.create(payload);
        addToast('Maintenance issue reported', 'success');
      }
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
      title={isEdit ? 'Edit Maintenance Record' : 'Report Maintenance Issue'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { resetForm(); onClose(); }}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !machineId || !problem.trim()}
          >
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Submit'}
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
        <select className="form-select" value={machineId} onChange={(e) => setMachineId(e.target.value)} disabled={!stationId}>
          <option value="">Select machine</option>
          {machineOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {selectedMachine && (
        <div className="card" style={{ marginBottom: '16px', padding: '12px', background: '#f9f9f9' }}>
          <span className="info-label">Station: </span>
          <span className="info-value">{selectedMachine.station_name} | </span>
          <span className="info-label">Stock: </span>
          <span className="info-value">{selectedMachine.current_stock}/{selectedMachine.capacity}</span>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Problem</label>
        <textarea className="form-textarea" rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Describe the issue..." />
      </div>
      <div className="form-group">
        <label className="form-label">Reported Date</label>
        <input type="date" className="form-input" value={reportedDate} onChange={(e) => setReportedDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Priority</label>
        <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          {MAINTENANCE_PRIORITIES.map((p) => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Technician</label>
        <input type="text" className="form-input" value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="Technician name" />
      </div>
      <div className="form-group">
        <label className="form-label">Status</label>
        <select className="form-select" value={statusVal} onChange={(e) => setStatusVal(e.target.value)}>
          {MAINTENANCE_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
      </div>
      {showResolved && (
        <div className="form-group">
          <label className="form-label">Resolved Date</label>
          <input type="date" className="form-input" value={resolvedDate} onChange={(e) => setResolvedDate(e.target.value)} />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Remark</label>
        <textarea className="form-textarea" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </div>
    </Modal>
  );
}

export default Maintenance;
