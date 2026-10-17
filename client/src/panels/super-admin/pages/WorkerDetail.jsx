import { useState, useEffect } from 'react'
import { api } from '../api/auth'
import AttendanceCalendar from './AttendanceCalendar'
import ResetPasswordModal from '../components/ResetPasswordModal'
import { deptLabel } from '../../../lib/labels'
import {
  ArrowLeft, Briefcase, Buildings, CalendarBlank, CurrencyCircleDollar,
  Database, HandCoins, IdentificationCard,
  Key, Phone, TrendUp, User, Wallet,
} from '@phosphor-icons/react'

export default function WorkerDetail({ workerId, onBack }) {
  const [worker, setWorker] = useState(null)
  const [allocations, setAllocations] = useState([])
  const [salary, setSalary] = useState(null)
  const [froStats, setFroStats] = useState(null)
  const [ngos, setNgos] = useState([])
  const [err, setErr] = useState('')
  const [showReset, setShowReset] = useState(false)

  useEffect(() => {
    Promise.all([
      api(`/workers/${workerId}`),
      api(`/workers/${workerId}/allocations`),
      // NGOs resolve the allocation ids to names for the hero details.
      api(`/ngos`).catch((err) => { console.error('Error:', err.message); return [] }),
      api(`/salary/worker/${workerId}/allocations`).catch((err) => { console.error('Error:', err.message); }),
    ]).then(([w, a, n, s]) => {
      setWorker(w); setAllocations(a || []); setNgos(n || []); setSalary(s)
    }).catch(e => setErr(e.message))
  }, [workerId])

  useEffect(() => {
    if (worker?.department?.toLowerCase() === 'fro') {
      api(`/dashboard/fro-worker/${workerId}`).then(setFroStats).catch((err) => { console.error('Error:', err.message); })
    }
  }, [workerId, worker?.department])

  if (err) return <div className="sa-err-card">{err}</div>

  if (!worker) return (
    <div className="sa-page volunteer-profile-page">
      <div className="vp-hero vp-skeleton">
        <div className="sk" style={{ width: 84, height: 84, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="sk" style={{ width: 200, height: 22, marginBottom: 8 }} />
          <div className="sk" style={{ width: 260, height: 13 }} />
        </div>
      </div>
      <div className="vp-grid">
        <div className="vp-col">
          <div className="vp-card vp-skeleton">
            <div className="sk" style={{ width: 150, height: 14, marginBottom: 14 }} />
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0' }}>
                <div className="sk" style={{ width: 28, height: 28, borderRadius: 8 }} />
                <div className="sk" style={{ width: '35%', height: 10 }} />
                <div className="sk" style={{ flex: 1, height: 12 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="vp-col">
          <div className="vp-card vp-skeleton">
            <div className="sk" style={{ width: 180, height: 14, marginBottom: 14 }} />
            <div className="sk" style={{ width: '100%', height: 220 }} />
          </div>
        </div>
      </div>
    </div>
  )

  const isActive = worker.is_active !== false
  const formatMoney = (v) => v ? `₹${Number(v).toLocaleString()}` : '₹0'
  const initials = (worker.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const allocatedNgoIds = new Set(allocations.map(a => a.ngo_id))
  const ngoText = ngos.filter(n => allocatedNgoIds.has(n.id)).map(n => n.name).join(', ')

  // Personal Information rows: icon, label, value. Long values wrap rather than
  // widen the card, and unavailable fields fall back to the existing '—'.
  const infoRows = [
    { icon: <IdentificationCard size={14} />, label: 'Login ID', value: worker.login_id, code: true },
    { icon: <Phone size={14} />, label: 'Phone', value: worker.phone },
    { icon: <CalendarBlank size={14} />, label: 'Date of Birth', value: worker.dob },
    { icon: <Wallet size={14} />, label: 'Salary', value: formatMoney(worker.salary) },
    {
      icon: <CalendarBlank size={14} />, label: 'Joined On',
      value: worker.created_at ? new Date(worker.created_at).toLocaleDateString() : null,
    },
  ]

  const salaryTiles = [
    { icon: <Wallet size={17} />, label: 'Total Salary', value: formatMoney(salary?.totalSalary), tone: 'indigo' },
    { icon: <CurrencyCircleDollar size={17} />, label: 'Per Day', value: formatMoney(salary?.perDay), tone: 'teal' },
    { icon: <CalendarBlank size={17} />, label: 'Days in Month', value: salary?.daysInMonth || '—', tone: 'amber' },
  ]

  const froTiles = [
    { icon: <HandCoins size={17} />, label: 'Total Donation', value: `₹${Number(froStats?.total_donations || 0).toLocaleString()}`, tone: 'green' },
    { icon: <TrendUp size={17} />, label: 'Daily Donation', value: `₹${Number(froStats?.daily_donations || 0).toLocaleString()}`, tone: 'blue' },
    { icon: <Database size={17} />, label: 'Assigned Data', value: froStats?.assigned_data || 0, tone: 'purple' },
  ]

  return (
    <div className="sa-page volunteer-profile-page">

      {/* ── Profile hero ─────────────────────────────────────────────── */}
      <section className="vp-hero">
        <div className="vp-avatar">
          {initials}
          {isActive && <span className="vp-avatar-dot" aria-hidden="true" />}
        </div>
        <div className="vp-hero-main">
          <div className="vp-hero-name-row">
            <h1 className="vp-name">{worker.name}</h1>
            <span className={`vp-status ${isActive ? 'active' : 'inactive'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="vp-hero-meta">
            <span className="vp-meta-item"><Briefcase size={13} />{deptLabel(worker.department) || '—'}</span>
            <span className="vp-meta-dot" aria-hidden="true">·</span>
            <span className="vp-meta-item"><Buildings size={13} />{ngoText}</span>
            {worker.gender && <>
              <span className="vp-meta-dot" aria-hidden="true">·</span>
              <span className="vp-meta-item"><User size={13} />{worker.gender}</span>
            </>}
          </div>
        </div>
        <div className="vp-hero-actions">
          <button className="vp-btn" onClick={onBack}>
            <ArrowLeft size={15} />Back
          </button>
          <button className="vp-btn vp-btn-primary" onClick={() => setShowReset(true)}>
            <Key size={15} />Reset Password
          </button>
        </div>
      </section>

      {/* ── Two-column content ───────────────────────────────────────── */}
      <div className="vp-grid">

        {/* Left column */}
        <div className="vp-col">
          <section className="vp-card">
            <h2 className="vp-card-title"><IdentificationCard size={15} />Personal Information</h2>
            <div className="vp-fields">
              {infoRows.map(row => (
                <div className="vp-field" key={row.label}>
                  <span className="vp-field-icon" aria-hidden="true">{row.icon}</span>
                  <span className="vp-field-label">{row.label}</span>
                  <span className={`vp-field-value${row.code ? ' is-code' : ''}`}>{row.value || '—'}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Narrow column can't hold three tiles side by side, so the salary
              summary stacks one row per tile here instead. */}
          {salary && (
            <section className="vp-card">
              <h2 className="vp-card-title"><Wallet size={15} />Salary Breakdown</h2>
              <div className="vp-metrics vp-metrics-stack">
                {salaryTiles.map(t => (
                  <div className={`vp-metric tone-${t.tone}`} key={t.label}>
                    <span className="vp-metric-icon">{t.icon}</span>
                    <div className="vp-metric-label">{t.label}</div>
                    <div className="vp-metric-value">{t.value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="vp-col">
          <AttendanceCalendar workerId={workerId} worker={worker} />

          {froStats && (
            <section className="vp-card">
              <h2 className="vp-card-title"><HandCoins size={15} />FRO Performance</h2>
              <div className="vp-metrics">
                {froTiles.map(t => (
                  <div className={`vp-metric tone-${t.tone}`} key={t.label}>
                    <span className="vp-metric-icon">{t.icon}</span>
                    <div className="vp-metric-label">{t.label}</div>
                    <div className="vp-metric-value">{t.value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {showReset && <ResetPasswordModal worker={worker} onClose={() => setShowReset(false)} />}
    </div>
  )
}
