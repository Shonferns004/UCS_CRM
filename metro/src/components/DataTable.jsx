import React from 'react';
import Pagination from './Pagination';

function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No data found',
  onRowClick,
  pagination,
  onPageChange,
  onSort,
  sortBy,
  sortDir,
}) {
  if (loading) {
    return (
      <div className="table-wrapper">
        <div className="loading-spinner">
          <div className="spinner" />
          <span className="loading-spinner-message">Loading data...</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-wrapper">
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <p className="empty-state-message">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const handleSort = (key) => {
    if (!onSort) return;
    const newDir = sortBy === key && sortDir === 'asc' ? 'desc' : 'asc';
    onSort(key, newDir);
  };

  const renderSortIndicator = (colKey) => {
    if (sortBy !== colKey) return <span className="sort-indicator">⇅</span>;
    return (
      <span className="sort-indicator">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="table-wrapper">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? 'sortable' : ''}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  {col.label}
                  {col.sortable && renderSortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={row.id || row._id || idx}
                className={onRowClick ? 'clickable' : ''}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && (
        <div className="table-footer">
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            limit={pagination.limit}
            onPageChange={onPageChange}
            onLimitChange={pagination.onLimitChange}
          />
        </div>
      )}
    </div>
  );
}

export default DataTable;
