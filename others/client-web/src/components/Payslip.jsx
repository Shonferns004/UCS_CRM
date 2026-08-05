import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Payslip() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.salaryBreakdown().then(d => setData(d)).catch(e => setError(e.message || 'Could not load salary')).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="app-container space-y-4 animate-fade-in">
        <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="h-40 bg-white rounded-2xl border border-[var(--border)] animate-pulse" />
        <div className="h-40 bg-white rounded-2xl border border-[var(--border)] animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-container space-y-4 animate-fade-in">
        <div className="p-4 rounded-xl bg-[var(--red-bg)] text-[var(--red)] text-sm">{error}</div>
      </div>
    )
  }

  if (!data?.hasSalary) {
    return (
      <div className="app-container space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold">Payslip</h2>
        <div className="p-6 rounded-2xl bg-white border border-[var(--border)] text-center text-sm text-[var(--ink-muted)]">
          No salary record found yet.
        </div>
      </div>
    )
  }

  const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
  const salary = parseFloat(data.salary || 0)
  const rows = [
    { label: 'Basic Salary (Monthly)', value: inr(salary), bold: true },
    { label: 'Per-day rate', value: inr(data.perDay) },
    { label: 'Paid days', value: `${data.paidDays ?? 0} / ${data.availableDays ?? data.daysInMonth ?? 0}` },
    { label: 'Late deduction', value: `${data.lateDeductionDays ?? 0} day(s) (${data.totalLateMinutes ?? 0}m late)` },
    { label: 'Half days', value: String(data.halfDayCount ?? 0) },
    { label: 'Absent days', value: String(data.absentCount ?? 0) },
    { label: 'Extra Sundays', value: String(data.extraSundayCount ?? 0) },
    { label: 'Joining deduction', value: data.joiningDeduction ? `${data.joiningDeduction} day(s)` : 'None' },
  ]
  if (data.totalLoanDeduction > 0) rows.push({ label: 'Loan deduction', value: `-${inr(data.totalLoanDeduction)}`, red: true })

  return (
    <div className="app-container space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Payslip</h2>
        <span className="text-xs text-[var(--ink-muted)]">This month</span>
      </div>

      {/* Salary card */}
      <div className="bg-gradient-to-br from-[var(--primary)] to-[var(--primary-light)] rounded-2xl p-5 text-white">
        <div className="text-[10px] uppercase tracking-widest text-white/60">Net Payable</div>
        <div className="text-3xl font-bold mt-1">{inr(data.totalDue)}</div>
        <div className="text-xs text-white/70 mt-1">Normal due: {inr(data.normalTotalDue)}</div>
      </div>

      {/* Breakdown */}
      <div className="bg-white rounded-2xl border border-[var(--border)] divide-y divide-[var(--border)]">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-[var(--ink-soft)]">{r.label}</span>
            <span className={`text-sm ${r.bold ? 'font-semibold text-[var(--ink)]' : ''} ${r.red ? 'text-[var(--red)] font-medium' : 'font-medium'}`}>{r.value}</span>
          </div>
        ))}
      </div>

      {data.incentiveTotal > 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border)] p-4">
          <div className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider mb-2">Incentives</div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-soft)]">Monthly incentive</span>
            <span className="font-semibold text-[var(--green)]">{inr(data.incentiveTotal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
