import { Search, X } from 'lucide-react';

/**
 * Shared search box for the WhatsApp Accounts surfaces (account header,
 * agents drawer, assign panel). Presentational only: the caller owns the
 * value and the change handler, so debounce and filtering stay where the
 * data lives.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
  inputRef,
  className = '',
}) {
  return (
    <div className={`wa-search-box${className ? ` ${className}` : ''}`}>
      <Search className="wa-search-box-ico" size={16} strokeWidth={1.8} aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        className="wa-search-box-input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          className="wa-search-box-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
