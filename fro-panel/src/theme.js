export const themes = [
  { id: 'sage', label: 'Sage', primary: '#4a7c6f', sidebar: '#2c3e3a', colors: { badge: '#4a7c6f', hover: '#3d6b5f', light: '#e8f5ee', border: '#c8e0d4' } },
  { id: 'blue', label: 'Blue', primary: '#3b82f6', sidebar: '#1e3a5f', colors: { badge: '#3b82f6', hover: '#2563eb', light: '#eff6ff', border: '#bfdbfe' } },
  { id: 'emerald', label: 'Emerald', primary: '#059669', sidebar: '#065f46', colors: { badge: '#059669', hover: '#047857', light: '#ecfdf5', border: '#a7f3d0' } },
  { id: 'purple', label: 'Purple', primary: '#8b5cf6', sidebar: '#4c1d95', colors: { badge: '#8b5cf6', hover: '#7c3aed', light: '#f5f3ff', border: '#ddd6fe' } },
  { id: 'rose', label: 'Rose', primary: '#e11d48', sidebar: '#881337', colors: { badge: '#e11d48', hover: '#be123c', light: '#fff1f2', border: '#fecdd3' } },
  { id: 'amber', label: 'Amber', primary: '#d97706', sidebar: '#78350f', colors: { badge: '#d97706', hover: '#b45309', light: '#fffbeb', border: '#fde68a' } },
  { id: 'teal', label: 'Teal', primary: '#0d9488', sidebar: '#134e4a', colors: { badge: '#0d9488', hover: '#0f766e', light: '#f0fdfa', border: '#99f6e4' } },
  { id: 'ocean', label: 'Ocean', primary: '#0891b2', sidebar: '#164e63', colors: { badge: '#0891b2', hover: '#0e7490', light: '#ecfeff', border: '#a5f3fc' } },
  { id: 'sky', label: 'Sky', primary: '#0284c7', sidebar: '#0c4a6e', colors: { badge: '#0284c7', hover: '#0369a1', light: '#f0f9ff', border: '#bae6fd' } },
  { id: 'marine', label: 'Marine', primary: '#1d4ed8', sidebar: '#1e3a8a', colors: { badge: '#1d4ed8', hover: '#1e40af', light: '#eff6ff', border: '#bfdbfe' } },
  { id: 'indigo', label: 'Indigo', primary: '#6366f1', sidebar: '#3730a3', colors: { badge: '#6366f1', hover: '#4f46e5', light: '#eef2ff', border: '#c7d2fe' } },
  { id: 'steel', label: 'Steel', primary: '#475569', sidebar: '#1e293b', colors: { badge: '#475569', hover: '#334155', light: '#f8fafc', border: '#cbd5e1' } },
  { id: 'iceberg', label: 'Iceberg', primary: '#06b6d4', sidebar: '#155e75', colors: { badge: '#06b6d4', hover: '#0891b2', light: '#f0fdfe', border: '#a5f3fc' } },
  { id: 'twilight', label: 'Twilight', primary: '#7c3aed', sidebar: '#3b0764', colors: { badge: '#7c3aed', hover: '#6d28d9', light: '#f5f3ff', border: '#ddd6fe' } },
  { id: 'cerulean', label: 'Cerulean', primary: '#0ea5e9', sidebar: '#0c4a6e', colors: { badge: '#0ea5e9', hover: '#0284c7', light: '#f0f9ff', border: '#bae6fd' } },
  { id: 'sapphire', label: 'Sapphire', primary: '#2563eb', sidebar: '#172554', colors: { badge: '#2563eb', hover: '#1d4ed8', light: '#eff6ff', border: '#bfdbfe' } },
]

export function applyTheme(themeId) {
  const theme = themes.find(t => t.id === themeId)
  if (!theme) return
  const r = document.documentElement
  r.style.setProperty('--primary', theme.primary)
  r.style.setProperty('--primary-hover', theme.colors.hover)
  r.style.setProperty('--bg-sidebar', theme.sidebar)
  r.style.setProperty('--badge', theme.colors.badge)
  r.style.setProperty('--light', theme.colors.light)
  r.style.setProperty('--border-light', theme.colors.border)
  localStorage.setItem('ucs_theme', themeId)
}
