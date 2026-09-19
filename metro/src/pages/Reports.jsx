import React, { useState, useMemo, useCallback } from 'react';
import useApi from '../hooks/useApi.js';
import useToast from '../hooks/useToast.js';
import usePagination from '../hooks/usePagination.js';
import * as metroLineService from '../services/metroLine.service.js';
import * as stationService from '../services/station.service.js';
import * as reportService from '../services/report.service.js';
import { MONTHS } from '../utils/constants.js';
import { getErrorMessage, formatNumber } from '../utils/formatters.js';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import KpiCard from '../components/KpiCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const REPORT_TYPES = [
  { key: 'station', label: 'Station Report' },
  { key: 'machine', label: 'Machine Report' },
  { key: 'metro-line', label: 'Metro Line Report' },
  { key: 'monthly', label: 'Monthly Report' },
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

function toTitleCase(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Reports() {
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit } = usePagination();

  const [reportType, setReportType] = useState('station');
  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const yearOptions = useMemo(() => {
    const opts = [];
    for (let y = currentYear; y >= 2024; y--) {
      opts.push({ value: y, label: String(y) });
    }
    return opts;
  }, []);

  const monthOptions = useMemo(() =>
    MONTHS.map((name, i) => ({ value: i + 1, label: name })),
  []);

  const { data: linesData, loading: linesLoading } = useApi(
    () => metroLineService.getAll({ page: 1, limit: 100 }),
    []
  );

  const lineOptions = useMemo(() => {
    const lines = linesData?.lines || [];
    return lines.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));
  }, [linesData]);

  const { data: stationsData, loading: stationsLoading } = useApi(
    () => (lineId ? stationService.getAll({ lineId, limit: 200 }) : Promise.resolve(null)),
    [lineId]
  );

  const stationOptions = useMemo(() => {
    const stations = stationsData?.stations || [];
    return stations.map((s) => ({ value: s.id, label: s.name }));
  }, [stationsData]);

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'lineId') { setLineId(value); setStationId(''); }
    else if (key === 'stationId') setStationId(value);
    else if (key === 'year') setYear(Number(value) || currentYear);
    else if (key === 'month') setMonth(Number(value) || currentMonth);
  }, []);

  const handleClearFilters = useCallback(() => {
    setLineId('');
    setStationId('');
    setYear(currentYear);
    setMonth(currentMonth);
  }, []);

  const reportParams = useMemo(() => {
    const p = {};
    if (lineId) p.lineId = lineId;
    if (reportType === 'station' && stationId) p.stationId = stationId;
    if (reportType === 'monthly') { p.year = year; p.month = month; }
    return p;
  }, [reportType, lineId, stationId, year, month]);

  const paramsKey = JSON.stringify({ reportType, ...reportParams });

  const { data: reportData, loading, error, refetch } = useApi(
    () => reportService.getReport(reportType, reportParams),
    [paramsKey]
  );

  const rows = reportData?.rows || [];
  const summary = reportData?.summary;

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    return Object.keys(rows[0]).map((k) => ({
      key: k,
      label: toTitleCase(k),
      render: k === 'status'
        ? (val) => <StatusBadge status={val} size="sm" />
        : undefined,
    }));
  }, [rows]);

  const handleExport = useCallback((format) => {
    reportService
      .downloadExport(reportType, reportParams, format)
      .catch((err) => addToast(getErrorMessage(err), 'error'));
  }, [reportType, reportParams]);

  const filters = useMemo(() => {
    const f = [];
    if (reportType === 'monthly') {
      f.push(
        {
          key: 'year',
          type: 'select',
          value: year,
          label: 'Select Year',
          options: yearOptions,
        },
        {
          key: 'month',
          type: 'select',
          value: month,
          label: 'Select Month',
          options: monthOptions,
        },
      );
    }
    f.push({
      key: 'lineId',
      type: 'select',
      value: lineId,
      label: 'All Metro Lines',
      options: lineOptions,
    });
    if (reportType === 'station') {
      f.push({
        key: 'stationId',
        type: 'select',
        value: stationId,
        label: 'All Stations',
        options: stationOptions,
      });
    }
    return f;
  }, [reportType, year, month, lineId, stationId, yearOptions, monthOptions, lineOptions, stationOptions]);

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Reports</h1>
        </div>
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
      </div>

      <div className="report-tabs">
        {REPORT_TYPES.map((t) => (
          <button
            key={t.key}
            className={`tab${reportType === t.key ? ' active' : ''}`}
            onClick={() => setReportType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        loading={linesLoading || stationsLoading}
      />

      <div className="export-bar">
        <button className="btn btn-outline btn-sm" onClick={() => handleExport('csv')}>
          Export CSV
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => handleExport('xlsx')}>
          Export Excel
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => handleExport('pdf')}>
          Export PDF
        </button>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading report..." />
      ) : (
        <>
          {reportType === 'monthly' && summary && (
            <div className="kpi-grid">
              <KpiCard title="Total Machines" value={formatNumber(summary.totalMachines ?? 0)} icon="🖥️" color="primary" />
              <KpiCard title="Active" value={formatNumber(summary.activeMachines ?? 0)} icon="🟢" color="success" />
              <KpiCard title="Inactive" value={formatNumber(summary.inactiveMachines ?? 0)} icon="🔴" color="danger" />
              <KpiCard title="Total Refills" value={formatNumber(summary.totalRefills ?? 0)} icon="🔄" color="info" />
              <KpiCard title="Pads Refilled" value={formatNumber(summary.totalPadsRefilled ?? 0)} icon="🩸" color="success" />
              <KpiCard title="Missing Pads" value={formatNumber(summary.missingPads ?? 0)} icon="⚠️" color="danger" />
              <KpiCard title="Maintenance Cases" value={formatNumber(summary.maintenanceCases ?? 0)} icon="🛠️" color="warning" />
            </div>
          )}

          <p style={{ marginBottom: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
            {formatNumber(rows.length)} record{rows.length !== 1 ? 's' : ''}
          </p>

          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            emptyMessage="No records match the selected filters"
            pagination={{
              currentPage: page,
              totalPages: Math.ceil(rows.length / limit) || 1,
              totalItems: rows.length,
              limit,
              onLimitChange: setLimit,
            }}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

export default Reports;
