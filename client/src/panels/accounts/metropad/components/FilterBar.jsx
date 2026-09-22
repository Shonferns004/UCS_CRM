import React from 'react';
import SearchInput from './SearchInput';
import { TrainFront, MapPin, Activity, CalendarDays } from 'lucide-react';

const DEFAULT_ICONS = {
  search: null,
  lineId: <TrainFront size={16} strokeWidth={2} />,
  stationId: <MapPin size={16} strokeWidth={2} />,
  status: <Activity size={16} strokeWidth={2} />,
  month: <CalendarDays size={16} strokeWidth={2} />,
  year: <CalendarDays size={16} strokeWidth={2} />,
};

function FilterBar({ filters = [], onChange, onClear, loading = false, className = '' }) {
  const handleChange = (key, value) => {
    if (onChange) {
      onChange(key, value);
    }
  };

  const hasActiveFilters = filters.some(
    (f) => f.value !== undefined && f.value !== '' && f.value !== null
  );

  return (
    <div className={`filter-bar${className ? ` ${className}` : ''}`}>
      {filters.map((filter) => {
        const icon = filter.icon || DEFAULT_ICONS[filter.key] || null;
        return (
          <div className="filter-item" key={filter.key}>
            {filter.type === 'search' && (
              <SearchInput
                value={filter.value || ''}
                onChange={(val) => handleChange(filter.key, val)}
                placeholder={filter.label}
                disabled={loading}
              />
            )}
            {(filter.type === 'select' || filter.type === 'date') && (
              <div className="filter-inner">
                {icon && (
                  <span className="filter-icon" aria-hidden="true">
                    {icon}
                  </span>
                )}
                {filter.type === 'select' ? (
                  <select
                    value={filter.value || ''}
                    onChange={(e) => handleChange(filter.key, e.target.value)}
                    disabled={loading}
                    aria-label={filter.label}
                  >
                    <option value="">{filter.label}</option>
                    {(filter.options || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    value={filter.value || ''}
                    onChange={(e) => handleChange(filter.key, e.target.value)}
                    disabled={loading}
                    aria-label={filter.label}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {hasActiveFilters && (
        <button className="filter-clear-btn" onClick={onClear} disabled={loading}>
          Clear
        </button>
      )}
    </div>
  );
}

export default FilterBar;