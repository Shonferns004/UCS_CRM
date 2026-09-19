export function Card({ children, className = '', style = {}, padding = 'md', hover = false, bordered = true }) {
  const paddingMap = {
    none: '0',
    sm: '12px',
    md: '16px',
    lg: '24px',
  };

  return (
    <div
      className={className}
      style={{
        background: 'var(--dev-card-bg)',
        border: bordered ? '1px solid var(--dev-border)' : 'none',
        borderRadius: '10px',
        boxShadow: 'var(--dev-shadow-sm)',
        padding: paddingMap[padding],
        transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 120ms ease',
        ...style,
        ...(hover && {
          '&:hover': {
            boxShadow: 'var(--dev-shadow-md)',
            borderColor: 'var(--dev-border-hover)',
            transform: 'translateY(-1px)',
          },
        }),
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className = '', style = {} }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--dev-text)' }}>{title}</h3>}
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--dev-text-secondary)' }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

export function CardContent({ children, className = '', style = {} }) {
  return <div className={className} style={{ ...style }}>{children}</div>;
}