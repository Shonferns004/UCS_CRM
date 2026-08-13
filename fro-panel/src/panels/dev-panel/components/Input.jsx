import { forwardRef } from 'react';

export const Input = forwardRef(({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = '',
  style = {},
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText && !error ? `${inputId}-helper` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style, width: '100%' }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dev-text-secondary)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {leftIcon && (
          <div style={{ position: 'absolute', left: '10px', color: 'var(--dev-text-muted)', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={errorId || helperId}
          style={{
            width: '100%',
            padding: leftIcon ? '8px 10px 8px 38px' : '8px 10px',
            paddingRight: rightIcon ? '38px' : '10px',
            fontSize: '13px',
            fontFamily: 'inherit',
            background: 'var(--dev-input-bg)',
            border: `1px solid ${error ? 'var(--dev-danger-main)' : 'var(--dev-input-border)'}`,
            borderRadius: '8px',
            color: 'var(--dev-text)',
            outline: 'none',
            transition: 'border-color 120ms ease, box-shadow 120ms ease',
            boxSizing: 'border-box',
            '&:focus': {
              borderColor: 'var(--dev-input-border-focus)',
              boxShadow: 'var(--dev-focus-ring)',
            },
            '&::placeholder': {
              color: 'var(--dev-text-muted)',
            },
          }}
          {...props}
        />
        {rightIcon && (
          <div style={{ position: 'absolute', right: '10px', color: 'var(--dev-text-muted)', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {rightIcon}
          </div>
        )}
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

Input.displayName = 'Input';