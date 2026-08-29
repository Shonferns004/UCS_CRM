export function Badge({ children, variant = 'default', size = 'md', className = '' }) {
  const variants = {
    default: { bg: '#e5e7eb', color: '#374151' },
    success: { bg: '#dcfce7', color: '#166534' },
    warning: { bg: '#fffbeb', color: '#b45309' },
    danger: { bg: '#fef2f2', color: '#b91c1c' },
    info: { bg: '#eff6ff', color: '#1e40af' },
    purple: { bg: '#faf5ff', color: '#7c3aed' },
  };

  const sizes = {
    sm: { padding: '1px 6px', fontSize: 9, borderRadius: 999 },
    md: { padding: '2px 8px', fontSize: 10, borderRadius: 999 },
    lg: { padding: '4px 10px', fontSize: 11, borderRadius: 999 },
  };

  const v = variants[variant] || variants.default;
  const s = sizes[size] || sizes.md;

  return (
    <span 
      className={className}
      style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: 3,
        fontWeight: 700,
        fontFamily: 'inherit',
        ...s,
        background: v.bg,
        color: v.color,
      }}
    >
      {children}
    </span>
  );
}

export default Badge;