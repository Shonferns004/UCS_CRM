import { forwardRef } from 'react';

export const Button = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  className = '',
  style = {},
  type = 'button',
  ...props
}, ref) => {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: 'inherit',
    fontWeight: 600,
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'all 120ms ease',
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : 'auto',
    outline: 'none',
  };

  const sizeStyles = {
    sm: { padding: '6px 12px', fontSize: '12px', height: '32px' },
    md: { padding: '8px 16px', fontSize: '13px', height: '40px' },
    lg: { padding: '10px 20px', fontSize: '14px', height: '48px' },
  };

  const variantStyles = {
    primary: {
      background: 'var(--dev-primary-600)',
      color: '#fff',
      borderColor: 'var(--dev-primary-600)',
    },
    secondary: {
      background: 'var(--dev-card-bg)',
      color: 'var(--dev-text)',
      borderColor: 'var(--dev-border)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--dev-text-secondary)',
      borderColor: 'transparent',
    },
    danger: {
      background: 'var(--dev-danger-main)',
      color: '#fff',
      borderColor: 'var(--dev-danger-main)',
    },
    outline: {
      background: 'transparent',
      color: 'var(--dev-primary-600)',
      borderColor: 'var(--dev-primary-500)',
    },
  };

  const hoverStyles = {
    primary: { background: 'var(--dev-primary-700)', borderColor: 'var(--dev-primary-700)' },
    secondary: { background: 'var(--dev-hover-bg)', borderColor: 'var(--dev-border-hover)' },
    ghost: { background: 'var(--dev-hover-bg)', color: 'var(--dev-text)' },
    danger: { background: 'var(--dev-danger-dark)', borderColor: 'var(--dev-danger-dark)' },
    outline: { background: 'var(--dev-primary-50)', color: 'var(--dev-primary-700)' },
  };

  const mergedStyle = {
    ...baseStyles,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={mergedStyle}
      className={className}
      onMouseEnter={e => !disabled && !loading && Object.assign(e.currentTarget.style, hoverStyles[variant])}
      onMouseLeave={e => !disabled && !loading && Object.assign(e.currentTarget.style, variantStyles[variant])}
      {...props}
    >
      {loading && (
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>
      )}
      {children}
    </button>
  );
});

Button.displayName = 'Button';