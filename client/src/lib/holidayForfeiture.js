// Month-scoped holiday forfeiture rules mirrored from
// backend/src/utils/salaryDays.js. Keep both lists in sync.

export const HOLIDAY_FORFEITURE_RULES = {
  '2026-11': [
    {
      holidayDates: ['2026-11-09', '2026-11-10'],
      triggerDate: '2026-11-11',
    },
  ],
};

const ymd = (value) => String(value || '').slice(0, 10)

// Returns the holiday dates that must be treated as absent for one worker.
// A worker forfeits the listed holidays when they did not report (present /
// late / half-day) on the trigger date.
export function getForfeitedHolidayDates({ year, month, holidayDates, records, workerCreatedAt }) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const rules = HOLIDAY_FORFEITURE_RULES[monthKey] || []
  const holidaySet = new Set((holidayDates || []).map(ymd))
  const recordByDate = new Map((records || []).map((r) => [ymd(r.date), r]))
  const joinYmd = ymd(workerCreatedAt)
  const todayYmd = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const present = (rec) => !!rec && ['present', 'late', 'half-day'].includes(rec.status)
  const forfeited = []

  for (const rule of rules) {
    const trigger = ymd(rule.triggerDate)
    if (!trigger) continue
    if (trigger > todayYmd) continue
    if (joinYmd && trigger < joinYmd) continue
    const didNotReport = !present(recordByDate.get(trigger))
    if (!didNotReport) continue
    for (const holiday of rule.holidayDates || []) {
      const date = ymd(holiday)
      if (!holidaySet.has(date)) continue
      if (joinYmd && date < joinYmd) continue
      if (present(recordByDate.get(date))) continue
      forfeited.push(date)
    }
  }

  return [...new Set(forfeited)]
}
