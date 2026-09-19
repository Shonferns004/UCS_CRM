import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useApi from '../hooks/useApi.js';
import usePagination from '../hooks/usePagination.js';
import * as auditService from '../services/audit.service.js';
import { getErrorMessage, formatDateTime } from '../utils/formatters.js';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ErrorState from '../components/ErrorState.jsx';

const ENTITY_OPTIONS = [
  { value: 'METRO_LINE', label: 'Metro Line' },
  { value: 'STATION', label: 'Station' },
  { value: 'MACHINE', label: 'Machine' },
  { value: 'REFILL', label: 'Refill' },
  { value: 'STOCK_ISSUE', label: 'Stock Issue' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'USER', label: 'User' },
];

function AuditLogs() {
  const { page, setPage, limit, setLimit, reset } = usePagination();

  const [entity, setEntity] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);

  useEffect(() => {
    reset();
  }, [entity, reset]);

  const params = useMemo(() => {
    const p = { page, limit };
    if (entity) p.entity = entity;
    return p;
  }, [entity, page, limit]);

  const { data: logsData, loading, error, refetch } = useApi(
    () => auditService.getAll(params),
    [JSON.stringify(params)]
  );

  const meta = logsData?.meta || {};
  const totalPages = meta.totalPages ?? meta.total_pages ?? 1;
  const totalItems = meta.totalItems ?? meta.total ?? 0;

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'entity') setEntity(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setEntity('');
  }, []);

  const formatValue = (value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const columns = [
    { key: 'created_at', label: 'Timestamp', render: (val) => formatDateTime(val) || '—' },
    { key: 'user_name', label: 'User' },
    {
      key: 'action',
      label: 'Action',
      render: (val) => <StatusBadge status={val === 'CREATE' || val === 'UPDATE' || val === 'DELETE' ? 'IN_PROGRESS' : 'OPEN'} size="sm" />,
    },
    { key: 'entity', label: 'Entity', render: (val) => (val || '').replace(/_/g, ' ') },
    { key: 'entity_id', label: 'Entity ID', render: (val) => (val ? `${String(val).slice(0, 8)}...` : '—') },
    {
      key: 'actions',
      label: 'Details',
      render: (_, row) => (
        <button
          className="btn btn-outline btn-sm"
          onClick={(e) => { e.stopPropagation(); setDetailTarget(row); }}
        >
          View
        </button>
      ),
    },
  ];

  const filters = [
    { key: 'entity', type: 'select', value: entity, label: 'All Entities', options: ENTITY_OPTIONS },
  ];

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Audit Logs</h1>
        </div>
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Audit Logs</h1>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        loading={loading}
      />

      <DataTable
        columns={columns}
        data={logsData?.logs || []}
        loading={loading}
        emptyMessage="No audit logs found"
        pagination={{
          currentPage: page,
          totalPages,
          totalItems,
          limit,
          onLimitChange: setLimit,
        }}
        onPageChange={setPage}
      />

      <Modal
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title="Audit Log Details"
        size="lg"
        footer={
          <button className="btn btn-secondary" onClick={() => setDetailTarget(null)}>
            Close
          </button>
        }
      >
        {detailTarget && (
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Timestamp</span>
              <span className="info-value">{formatDateTime(detailTarget.created_at)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">User</span>
              <span className="info-value">{detailTarget.user_name || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Action</span>
              <span className="info-value">{detailTarget.action}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Entity</span>
              <span className="info-value">{(detailTarget.entity || '').replace(/_/g, ' ')}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Entity ID</span>
              <span className="info-value">{detailTarget.entity_id || '—'}</span>
            </div>
            <div className="info-item" style={{ gridColumn: '1 / -1' }}>
              <span className="info-label">Old Value</span>
              <pre className="info-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatValue(detailTarget.old_value)}
              </pre>
            </div>
            <div className="info-item" style={{ gridColumn: '1 / -1' }}>
              <span className="info-label">New Value</span>
              <pre className="info-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatValue(detailTarget.new_value)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AuditLogs;