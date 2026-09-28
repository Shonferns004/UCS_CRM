export function fmt(seconds) {
  if (seconds == null) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const STATUS_META = {
  on_call: { label: 'On Call', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  online: { label: 'Online', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  // Idle = the FRO's 4-minute disposition window ran out and they have not
  // pressed Resume. Accrues into their day total until they do.
  idle: { label: 'Idle', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  // A paused FRO or one in a company-wide meeting is held by an admin, not
  // idle by their own doing — shown distinctly so nobody is blamed for it.
  meeting: { label: 'Paused', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  offline: { label: 'Offline', color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb' },
}

export function StatBox({ label, value, icon }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{icon} {label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#091426' }}>{value}</div>
    </div>
  )
}
