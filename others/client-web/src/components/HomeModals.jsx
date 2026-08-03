import { useState, useEffect } from 'react'
import { api } from '../api'

const TYPE_LABELS = {
  full_day: 'Full Day',
  half_day: 'Half Day',
  vacational: 'Vacational',
  emergency: 'Emergency',
}

const daysFromNow = (dateStr) => {
  if (!dateStr) return 0
  const now = new Date()
  const target = new Date(dateStr + 'T00:00:00')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((t - today) / 86400000)
}

const toDateInput = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function HomeModals({ showLeave, setShowLeave, showAdvance, setShowAdvance }) {
  useEffect(() => {
    if (!showLeave && !showAdvance) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [showLeave, showAdvance])

  return (
    <>
      {showLeave && <LeaveModal onClose={() => setShowLeave(false)} />}
      {showAdvance && <AdvanceModal onClose={() => setShowAdvance(false)} />}
    </>
  )
}

function LeaveModal({ onClose }) {
  const [type, setType] = useState('full_day')
  const [leaveDate, setLeaveDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [halfStart, setHalfStart] = useState('10:00')
  const [halfEnd, setHalfEnd] = useState('13:00')
  const [reason, setReason] = useState('')
  const [proofBase64, setProofBase64] = useState('')
  const [proofMime, setProofMime] = useState('')
  const [proofName, setProofName] = useState('')
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.myLeaves().then(d => {
      const list = Array.isArray(d) ? d : d?.leaves || []
      setLeaves(list)
    }).catch(() => {})
  }, [])

  const minDate = () => {
    const today = new Date()
    if (type === 'full_day') today.setDate(today.getDate() + 2)
    else if (type === 'half_day') today.setDate(today.getDate() + 1)
    else if (type === 'vacational') today.setDate(today.getDate() + 30)
    return toDateInput(today)
  }

  const changeType = (t) => {
    setType(t)
    setLeaveDate('')
    setStartDate('')
    setEndDate('')
    setProofBase64('')
    setProofMime('')
    setProofName('')
  }

  const validate = () => {
    const now = new Date()
    if (type === 'full_day') {
      if (!leaveDate) return 'Please select a leave date'
      if (daysFromNow(leaveDate) < 2) return 'Full day leave must be applied at least 2 days prior'
      if (now.getHours() < 12) return 'Full day leave can only be applied after 12 PM'
    } else if (type === 'half_day') {
      if (!leaveDate) return 'Please select a leave date'
      if (!halfStart || !halfEnd) return 'Please select half day start and end time'
      if (daysFromNow(leaveDate) < 1) return 'Half day leave must be applied at least 1 day prior'
    } else if (type === 'vacational') {
      if (!startDate) return 'Please select start date'
      if (!endDate) return 'Please select end date'
      if (endDate < startDate) return 'End date must be on or after start date'
      if (daysFromNow(startDate) < 30) return 'Vacational leave must be applied at least 1 month prior'
    } else if (type === 'emergency') {
      if (!leaveDate) return 'Please select a leave date'
    }
    if (!reason.trim()) return 'Please provide a reason'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setLoading(true); setError('')
    try {
      const body = { type, reason: reason.trim() }
      if (type === 'full_day' || type === 'emergency') body.leave_date = leaveDate
      else if (type === 'half_day') {
        body.leave_date = leaveDate
        body.half_start_time = halfStart
        body.half_end_time = halfEnd
      } else if (type === 'vacational') {
        body.start_date = startDate
        body.end_date = endDate
      }
      if (proofBase64 && type !== 'half_day') {
        body.proof_data = proofBase64
        body.proof_mime = proofMime
      }
      await api.applyLeave(body)
      api.myLeaves().then(d => {
        const list = Array.isArray(d) ? d : d?.leaves || []
        setLeaves(list)
      }).catch(() => {})
      setSuccess(true)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const onPickProof = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setProofBase64(dataUrl.split(',')[1] || '')
      setProofMime(file.type || 'image/jpeg')
      setProofName(file.name)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const statusBadge = (s) => {
    const map = {
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
    }
    return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${map[s] || 'bg-gray-100 text-gray-600'}`}>{s || 'pending'}</span>
  }

  const leaveDates = (l) => {
    if (l.type === 'vacational') return `${l.start_date || ''} – ${l.end_date || ''}`
    if (l.type === 'half_day') return `${l.leave_date || ''} · ${(l.half_start_time || '').slice(0, 5)} – ${(l.half_end_time || '').slice(0, 5)}`
    return l.leave_date || ''
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90dvh] flex flex-col animate-slide-up md:animate-fade-in shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-[var(--border)] px-5 py-3.5 flex items-center justify-between rounded-t-2xl z-10">
          <h3 className="font-semibold">{success ? 'Request Submitted' : 'Apply for Leave'}</h3>
          <button onClick={onClose} className="text-[var(--ink-soft)] text-lg">&times;</button>
        </div>
        {success ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h4 className="font-semibold">Leave Applied!</h4>
            <p className="text-sm text-[var(--ink-soft)] mt-1">Your request has been submitted for approval.</p>
            <button onClick={onClose} className="mt-4 px-5 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 p-5 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {error && <div className="p-3 rounded-lg bg-[var(--red-bg)] text-[var(--red)] text-xs">{error}</div>}
            <div>
              <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Leave Type</label>
              <select value={type} onChange={e => changeType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500">
                <option value="full_day">Full Day</option>
                <option value="half_day">Half Day</option>
                <option value="vacational">Vacational</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>

            {(type === 'full_day' || type === 'half_day' || type === 'emergency') && (
              <div>
                <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Leave Date</label>
                <input type="date" value={leaveDate} min={minDate()} onChange={e => setLeaveDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500" />
                <div className={`mt-1 text-[11px] ${type === 'emergency' ? 'text-[var(--red)]' : 'text-[var(--ink-soft)]'}`}>
                  {type === 'full_day' && 'Must be 2 days prior and applied after 12 PM'}
                  {type === 'half_day' && 'Must be at least 1 day prior'}
                  {type === 'emergency' && 'Immediate emergency leave — no prior notice required'}
                </div>
              </div>
            )}

            {type === 'vacational' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">From Date</label>
                    <input type="date" value={startDate} min={minDate()} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">To Date</label>
                    <input type="date" value={endDate} min={startDate || minDate()} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div className="text-[11px] text-[var(--ink-soft)]">Must be applied at least 1 month prior</div>
              </>
            )}

            {type === 'half_day' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Start Time</label>
                  <input type="time" value={halfStart} onChange={e => setHalfStart(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">End Time</label>
                  <input type="time" value={halfEnd} onChange={e => setHalfEnd(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            )}

            {type !== 'half_day' && (
              <div>
                <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Proof (optional)</label>
                {proofBase64 ? (
                  <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                    <img src={`data:${proofMime};base64,${proofBase64}`} alt="proof" className="w-full h-36 object-cover" />
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-[var(--ink-soft)] truncate">{proofName || 'Proof attached'}</span>
                      <button type="button" onClick={() => { setProofBase64(''); setProofName('') }} className="text-[var(--red)] text-xs font-medium">Remove</button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--ink-soft)] cursor-pointer hover:bg-[var(--surface)]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span>Upload proof (image)</span>
                    <input type="file" accept="image/*" onChange={onPickProof} className="hidden" />
                  </label>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>

            <div className="pt-2 border-t border-[var(--border)]">
              <div className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider mb-2">My Leave History</div>
              {leaves.length === 0 ? (
                <div className="text-sm text-[var(--ink-muted)] py-2">No leave applications yet</div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {leaves.slice(0, 8).map((l, i) => (
                    <div key={l.id || i} className="flex items-center justify-between py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{TYPE_LABELS[l.type] || l.type}</div>
                        <div className="text-xs text-[var(--ink-soft)] truncate">{leaveDates(l)}{l.days ? ` · ${l.days} day${l.days > 1 ? 's' : ''}` : ''}</div>
                      </div>
                      {statusBadge(l.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-white md:rounded-b-2xl">
              <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50">
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function AdvanceModal({ onClose }) {
  const [type, setType] = useState('advance')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || !reason) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const body = { amount: parseFloat(amount), reason, type }
      if (type === 'advance') await api.applyAdvance(body)
      else await api.applyLoan(body)
      setSuccess(true)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90dvh] flex flex-col animate-slide-up md:animate-fade-in shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-[var(--border)] px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-semibold">{success ? 'Request Submitted' : 'Apply for Advance / Loan'}</h3>
          <button onClick={onClose} className="text-[var(--ink-soft)] text-lg">&times;</button>
        </div>
        {success ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h4 className="font-semibold">Application Submitted!</h4>
            <p className="text-sm text-[var(--ink-soft)] mt-1">Your request is pending approval.</p>
            <button onClick={onClose} className="mt-4 px-5 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 p-5 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {error && <div className="p-3 rounded-lg bg-[var(--red-bg)] text-[var(--red)] text-xs">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setType('advance')} className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${type === 'advance' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-[var(--border)] text-[var(--ink-soft)]'}`}>
                <div>Advance</div>
                <div className="text-[10px] font-normal opacity-70">repay from salary</div>
              </button>
              <button type="button" onClick={() => setType('loan')} className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${type === 'loan' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-[var(--border)] text-[var(--ink-soft)]'}`}>
                <div>Loan</div>
                <div className="text-[10px] font-normal opacity-70">monthly deduction</div>
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Amount (₹)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500" min="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder={`Explain why you need ${type === 'loan' ? 'a loan' : 'an advance'}`} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-white md:rounded-b-2xl">
              <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50">
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
