export const colors = {
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },
  success: {
    light: '#f0fdf4',
    main: '#16a34a',
    dark: '#15803d',
  },
  warning: {
    light: '#fefce8',
    main: '#d97706',
    dark: '#b45309',
  },
  danger: {
    light: '#fef2f2',
    main: '#dc2626',
    dark: '#b91c1c',
  },
  info: {
    light: '#eff6ff',
    main: '#2563eb',
    dark: '#1d4ed8',
  },
  status: {
    open: { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
    in_progress: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    under_review: { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
    resolved: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    closed: { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  },
  priority: {
    low: { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
    medium: { bg: '#fefce8', color: '#d97706', border: '#fde68a' },
    high: { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
    critical: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  },
  panel: {
    fro: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    accounts: { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
    ngo_admin: { bg: '#ede9fe', color: '#5b21b6', border: '#ddd6fe' },
  },
};

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
};

export const radius = {
  sm: '6px',
  md: '8px',
  lg: '10px',
  xl: '12px',
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
};

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontSize: {
    xs: '10px',
    sm: '12px',
    base: '14px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.625,
  },
};

export const transitions = {
  fast: '120ms ease',
  normal: '150ms ease',
  slow: '200ms ease',
};

export const zIndex = {
  dropdown: 100,
  sticky: 200,
  modal: 300,
  popover: 400,
  toast: 500,
};

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

export const lightTheme = {
  bg: colors.neutral[50],
  cardBg: '#ffffff',
  border: colors.neutral[200],
  borderHover: colors.neutral[300],
  text: colors.neutral[900],
  textSecondary: colors.neutral[600],
  textMuted: colors.neutral[500],
  textInverse: '#ffffff',
  sidebarBg: '#fafafa',
  sidebarBorder: colors.neutral[200],
  hoverBg: colors.neutral[100],
  activeBg: colors.primary[50],
  activeBorder: colors.primary[500],
  focusRing: '0 0 0 3px rgba(99, 102, 241, 0.4)',
  inputBg: '#ffffff',
  inputBorder: colors.neutral[200],
  inputBorderFocus: colors.primary[500],
};

export const darkTheme = {
  bg: colors.neutral[950] || '#030712',
  cardBg: colors.neutral[900],
  border: colors.neutral[800],
  borderHover: colors.neutral[700],
  text: '#fafafa',
  textSecondary: colors.neutral[400],
  textMuted: colors.neutral[500],
  textInverse: colors.neutral[900],
  sidebarBg: colors.neutral[900],
  sidebarBorder: colors.neutral[800],
  hoverBg: colors.neutral[800],
  activeBg: 'rgba(99, 102, 241, 0.15)',
  activeBorder: colors.primary[400],
  focusRing: '0 0 0 3px rgba(99, 102, 241, 0.5)',
  inputBg: colors.neutral[800],
  inputBorder: colors.neutral[700],
  inputBorderFocus: colors.primary[400],
};