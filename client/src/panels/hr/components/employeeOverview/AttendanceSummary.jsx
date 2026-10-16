// Compact attendance summary for the Overview tab — same source as the
// Attendance tab (attendance table + approved leaves). Deliberately summary
// only; "Open Attendance" jumps to the tab that owns editing and detail.

const STATUS_LABEL = { present: 'Present', absent: 'Absent', half_day: 'Half day', leave: 'On leave', holiday: 'Holiday' }

export default function AttendanceSummary({ data, onOpenAttendance }) {
  const att = data?.attendance
  if (!att || att.unavailable) return null

  const counts = att.status_counts || {}
  const chips = Object.entries(STATUS_LABEL)
    .filter(([k]) => counts[k] != null && counts[k] > 0)
    .map(([k, label]) => ({ key: k, label, n: counts[k] }))

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginRight: 'auto' }}>Attendance</div>
        {onOpenAttendance && (
          <button className="btn ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={onOpenAttendance}>
            Open Attendance
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{att.pct != null ? `${att.pct}%` : '—'}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)', marginLeft: 6 }}>
            {att.present_days} / {att.eligible_days} eligible days
          </span>
        </div>
        {att.approved_leave_days > 0 && (
          <span style={{ fontSize: 11, color: 'var(--ink-soft, #64748b)' }}>{att.approved_leave_days} approved leave day{att.approved_leave_days === 1 ? '' : 's'}</span>
        )}
        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 'auto' }}>
            {chips.map(c => (
              <span key={c.key} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'var(--bg, #f1f5fb)', border: '1px solid var(--line, #e5e7eb)', color: 'var(--ink-soft, #64748b)' }}>
                {c.label} · {c.n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
