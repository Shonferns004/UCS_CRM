import React from 'react';
import SearchInput from './SearchInput';
import { Search, TrainFront, MapPin, Activity, CalendarDays, ChevronDown } from 'lucide-react';

const DEFAULT_ICONS = {
  search: <Search size={15} strokeWidth={2} />,
  lineId: <TrainFront size={15} strokeWidth={2} />,
  stationId: <MapPin size={15} strokeWidth={2} />,
  status: <Activity size={15} strokeWidth={2} />,
  month: <CalendarDays size={15} strokeWidth={2} />,
  year: <CalendarDays size={15} strokeWidth={2} />,
};

function FilterBar({ filters = [], onChange, onClear, loading = false }) {
  const handleChange = (key, value) => {
    if (onChange) {
      onChange(key, value);
    }
  };

  const hasActiveFilters = filters.some(
    (f) => f.value !== undefined && f.value !== '' && f.value !== null
  );

  return (
    <div className="filter-bar">
      {filters.map((filter) => {
        const icon = filter.icon || DEFAULT_ICONS[filter.key] || null;
        return (
          <div className="filter-item" key={filter.key}>
            {filter.type === 'search' && (
              <div className="filter-select-wrap">
                <SearchInput
                  value={filter.value || ''}
                  onChange={(val) => handleChange(filter.key, val)}
                  placeholder={filter.label}
                  disabled={loading}
                />
              </div>
            )}
            {filter.type === 'select' && (
              <div className="filter-select-wrap">
                <span className="filter-select-icon">{icon}</span>
                <select
                  className="form-select"
                  value={filter.value || ''}
                  onChange={(e) => handleChange(filter.key, e.target.value)}
                  disabled={loading}
                >
                  <option value="">{filter.label}</option>
                  {(filter.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="filter-select-chevron">
                  <ChevronDown size={15} strokeWidth={2} />
                </span>
              </div>
            )}
            {filter.type === 'date' && (
              <div className="filter-select-wrap">
                <span className="filter-select-icon">{icon}</span>
                <input
                  type="date"
                  className="form-input"
                  value={filter.value || ''}
                  onChange={(e) => handleChange(filter.key, e.target.value)}
                  disabled={loading}
                />
              </div>
            )}
          </div>
        );
      })}
      {hasActiveFilters && (
        <button
          className="filter-clear-btn"
          onClick={onClear}
          disabled={loading}
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

export default FilterBar;