import { forwardRef } from 'react';

export const Select = forwardRef(({
  label,
  error,
  helperText,
  options = [],
  placeholder,
  className = '',
  style = {},
  id,
  ...props
}, ref) => {
  const selectId = id || `select-${Math.random().toString(36).slice(2, 9)}`;
  const errorId = error ? `${selectId}-error` : undefined;
  const helperId = helperText && !error ? `${selectId}-helper` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style, width: '100%' }}>
      {label && (
        <label htmlFor={selectId} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dev-text-secondary)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={errorId || helperId}
          style={{
            width: '100%',
            padding: '8px 36px 8px 10px',
            fontSize: '13px',
            fontFamily: 'inherit',
            background: 'var(--dev-input-bg)',
            border: `1px solid ${error ? 'var(--dev-danger-main)' : 'var(--dev-input-border)'}`,
            borderRadius: '8px',
            color: 'var(--dev-text)',
            outline: 'none',
            cursor: 'pointer',
            appearance: 'none',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            paddingRight: '36px',
            transition: 'border-color 120ms ease, box-shadow 120ms ease',
            boxSizing: 'border-box',
            '&:focus': {
              borderColor: 'var(--dev-input-border-focus)',
              boxShadow: 'var(--dev-focus-ring)',
            },
            '&:disabled': {
              opacity: 0.6,
              cursor: 'not-allowed',
            },
          }}
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((opt, i) => (
            <option key={opt.value ?? i} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      {error && (
        <p id={errorId} style={{ fontSize: '11px', color: 'var(--dev-danger-main)', margin: 0 }}>{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} style={{ fontSize: '11px', color: 'var(--dev-text-muted)', margin: 0 }}>{helperText}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';