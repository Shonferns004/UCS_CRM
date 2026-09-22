import { useEffect, useRef, useState, useCallback } from 'react'
import { Route, Routes, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { RemProvider, useRem, useUcs } from './store'
import { REM_HOME } from './config'
import { Icon } from './components'
import ToastContainer, { toast } from './Toast'
import {
  deleteReminder, completeReminder, snoozeReminder,
} from './api'
import { exportToCSV, exportToExcel, todayStr } from './helpers'
import {
  requestNotificationPermission, playAlarmSound, sendBrowserNotification,
  isDismissed, dismissAlarmKey, isSnoozed, getAlarmType, computeEffectiveDueDate
} from './notifications'
import AllReminders from './AllReminders'
import RemSettings from './Settings'
import DashboardPage from './Dashboard'
import { ReminderFormModal, HistoryModal, DeleteConfirmModal, AlarmToast } from './modals'

const DASH_PATH = `${REM_HOME}/dashboard`
const SETTINGS_PATH = `${REM_HOME}/settings`

function SlideToConfirm({ onConfirm, label = 'Slide to confirm', height = 46 }) {
  const trackRef = useRef(null)
  const [x, setX] = useState(0)
  const [active, setActive] = useState(false)
  const dragging = useRef(false)
  const knobW = height - 8

  const reset = () => { dragging.current = false; setActive(false); setX(0) }

  const handleMove = (clientX) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const max = rect.width - knobW - 6
    const nxt = Math.max(0, Math.min(max, clientX - rect.left))
    const reach = max * 0.86
    if (nxt >= reach) {
      reset()
      onConfirm()
      return
    }
    setX(nxt)
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => { dragging.current = true; setActive(true); e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (dragging.current) handleMove(e.clientX) }}
      onPointerUp={reset}
      onPointerCancel={reset}
      style={{
        position: 'relative', height, borderRadius: 99, overflow: 'hidden', cursor: 'grab',
        background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.35)',
        userSelect: 'none', touchAction: 'none', marginTop: 12,
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12.5, fontWeight: 700, color: '#2563eb', letterSpacing: 0.4, pointerEvents: 'none',
      }}>
        {label}
      </div>
      <div style={{
        position: 'absolute', left: 4, top: 4, bottom: 4, width: knobW, borderRadius: 99,
        background: active ? '#2563eb' : '#fff', boxShadow: active ? 'none' : '0 2px 6px rgba(15,23,42,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#fff' : '#2563eb',
        transform: `translateX(${x}px)`, transition: active ? 'none' : 'transform 0.18s ease',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </div>
    </div>
  )
}

function alarmCheck(reminders, settings, onFire) {
  for (const r of reminders) {
    if (r.completed_at || r.is_deleted) continue

    const effectiveDate = computeEffectiveDueDate(r)
    if (!effectiveDate) continue

    const alarmType = getAlarmType(r, 10)
    if (!alarmType) continue

    const key = `${r.id}-${alarmType}`
    if (isDismissed(key)) continue
    if (isSnoozed(key)) continue

    onFire(r, alarmType, effectiveDate)
  }
}

function Tabs() {
  return (
    <nav className="rem-tabs" role="tablist">
      <NavLink to={DASH_PATH} className={({ isActive }) => `rem-tab ${isActive ? 'active' : ''}`}>
        <Icon name="dashboard" size={15} /> Dashboard
      </NavLink>
      <NavLink end to={REM_HOME} className={({ isActive }) => `rem-tab ${isActive ? 'active' : ''}`}>
        <Icon name="list" size={15} /> All Reminders
      </NavLink>
      <NavLink to={SETTINGS_PATH} className={({ isActive }) => `rem-tab ${isActive ? 'active' : ''}`}>
        <Icon name="settings" size={15} /> Reminder Settings
      </NavLink>
    </nav>
  )
}

function PanelInner() {
  const { reminders, loading, refresh, notifications, refreshNotifications, settings, activeFilter, setActiveFilter } = useRem()
  const location = useLocation()
  const navigate = useNavigate()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [historyId, setHistoryId] = useState(null)
  const [historyReminder, setHistoryReminder] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  function openHistory(id, reminder) {
    setHistoryId(id)
    setHistoryReminder(reminder || null)
  }
  const [showComplete, setShowComplete] = useState(false)
  const [completeId, setCompleteId] = useState(null)
  const [completeAmount, setCompleteAmount] = useState('')
  const [completeDate, setCompleteDate] = useState('')
  const [completeTxn, setCompleteTxn] = useState('')
  const [txnStep, setTxnStep] = useState(false)
  const { user: accountsUser } = useUcs()
  const [alarmToasts, setAlarmToasts] = useState([])
  const firedRef = useRef(new Set())

  useEffect(() => { refresh(); refreshNotifications(); /* eslint-disable */ }, [])

  useEffect(() => {
    if (!reminders.length) return
    requestNotificationPermission()
    const check = () => {
      alarmCheck(reminders, settings, (r, type, effectiveDate) => {
        const key = `${r.id}-${type}`
        if (firedRef.current.has(key)) return
        firedRef.current.add(key)

        playAlarmSound(type)

        const typeLabel = type === 'OVERDUE' ? 'OVERDUE' : type === 'DUE_TODAY' ? 'DUE TODAY' : 'DUE SOON'
        sendBrowserNotification(
          `${typeLabel}: ${r.title}`,
          `${typeLabel} — ${r.due_date_display || r.title}${effectiveDate ? ` (due: ${effectiveDate})` : ''}`,
          key
        )

        setAlarmToasts(prev => {
          if (prev.some(t => t.reminderId === r.id && t.alarmType === type)) return prev
          return [...prev, { reminderId: r.id, reminder: r, alarmType: type }]
        })
      })
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [reminders, settings])

  const dismissAlarm = useCallback((key) => {
    dismissAlarmKey(key)
    setAlarmToasts(prev => prev.filter(t => `${t.reminderId}-${t.alarmType}` !== key))
  }, [])

  const onDashboard = location.pathname.startsWith(DASH_PATH)

  function openAdd() { setEditing(null); setFormKey(k => k + 1); setFormOpen(true) }
  function openEdit(c) { setEditing(c); setFormKey(k => k + 1); setFormOpen(true) }

  async function doDelete(c) {
    setDeleting(true)
    try {
      await deleteReminder(c.id)
      await refresh()
      toast('Reminder deleted successfully', 'success')
      setDeleteId(null)
    } catch (e) {
      toast(e.message || 'Failed to delete reminder', 'error')
    } finally { setDeleting(false) }
  }

  async function handleSaved() {
    setFormOpen(false); setEditing(null)
    try { await refresh() } catch { /* keep */ }
  }

  async function handleComplete(id) {
    setCompleteId(id)
    setCompleteAmount('')
    setCompleteDate(todayStr())
    setCompleteTxn('')
    setTxnStep(false)
    setShowComplete(true)
  }

  async function doComplete() {
    try {
      const payer = accountsUser?.name || accountsUser?.login_id || accountsUser?.email || ''
      const res = await completeReminder(completeId, {
        amount: completeAmount || undefined,
        paid_at: completeDate ? `${completeDate}T00:00:00` : undefined,
        transaction_id: completeTxn.trim() || undefined,
        paid_by: payer || undefined,
      })
      await refresh()
      toast(payer ? `${res.message || 'Reminder completed'} — paid by ${payer}` : (res.message || 'Reminder completed'), 'success')
      dismissAlarm(`${completeId}-OVERDUE`)
      dismissAlarm(`${completeId}-DUE_TODAY`)
      dismissAlarm(`${completeId}-DUE_SOON`)
    } catch (e) { toast(e.message || 'Failed', 'error') }
    setShowComplete(false)
    setCompleteId(null)
    setCompleteAmount('')
    setCompleteDate('')
    setCompleteTxn('')
    setTxnStep(false)
  }

  async function handleSnooze(id, minutes) {
    try {
      await snoozeReminder(id, minutes)
      await refresh()
      toast(`Snoozed for ${minutes} minutes`, 'success')
      dismissAlarm(`${id}-OVERDUE`)
      dismissAlarm(`${id}-DUE_TODAY`)
      dismissAlarm(`${id}-DUE_SOON`)
    } catch (e) { toast(e.message || 'Failed', 'error') }
  }

  return (
    <div className="rem-app">
      <ToastContainer />
      <div className="rem-toolbar">
        <Tabs />
        <div className="rem-actions">
          {onDashboard ? null : (
            <>
              <button className="rem-btn" onClick={() => { exportToCSV(reminders.filter(r => !r.is_deleted)); toast('CSV exported', 'success') }}>Export CSV</button>
              <button className="rem-btn" onClick={() => { exportToExcel(reminders.filter(r => !r.is_deleted)); toast('Excel exported', 'success') }}>Export</button>
            </>
          )}
        </div>
      </div>

      <div className="rem-content">
        <Routes>
          <Route index element={<AllReminders onAdd={openAdd} onEdit={openEdit} onDelete={setDeleteId} onHistory={openHistory} onComplete={handleComplete} onSnooze={handleSnooze} />} />
          <Route path="dashboard" element={<div style={{ padding: '0 0 24px' }}><DashboardPage /></div>} />
          <Route path="settings" element={<RemSettings />} />
          <Route path="*" element={<Navigate to={REM_HOME} replace />} />
        </Routes>
      </div>

      <ReminderFormModal key={formKey} open={formOpen} reminder={editing} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={handleSaved} onDelete={(c) => { setFormOpen(false); setEditing(null); setDeleteId(c) }} />
      <HistoryModal reminderId={historyId} reminder={historyReminder} open={!!historyId} onClose={() => { setHistoryId(null); setHistoryReminder(null) }} />
      <DeleteConfirmModal reminder={deleteId} deleting={deleting} onClose={() => { if (!deleting) setDeleteId(null) }} onConfirm={() => deleteId && doDelete(deleteId)} />

      {showComplete && (
        <div className="modal-overlay" onClick={() => { setShowComplete(false); setCompleteId(null) }}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3><Icon name="check" size={16} /> Mark as Paid</h3>
              <button className="modal-x" onClick={() => { setShowComplete(false); setCompleteId(null) }}>&times;</button>
            </div>
            <div className="modal-body">
              <label className="rem-label">Payment Amount (optional)</label>
              <input
                className="rem-input"
                type="number"
                placeholder="e.g. 5000"
                value={completeAmount}
                onChange={e => setCompleteAmount(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              <label className="rem-label" style={{ marginTop: 10 }}>Paid Date</label>
              <input
                className="rem-input"
                type="date"
                value={completeDate}
                max={todayStr()}
                onChange={e => setCompleteDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'var(--rem-ink-soft)', marginTop: 6 }}>
                Renewal date will be recalculated from this paid date.
              </div>

              {!txnStep ? (
                <SlideToConfirm onConfirm={() => setTxnStep(true)} label="Slide to confirm payment" />
              ) : (
                <>
                  <label className="rem-label" style={{ marginTop: 12 }}>Transaction ID</label>
                  <input
                    className="rem-input"
                    type="text"
                    placeholder="e.g. UPI ref / bank txn id"
                    value={completeTxn}
                    onChange={e => setCompleteTxn(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    autoFocus
                  />
                  <div style={{ fontSize: 11, color: 'var(--rem-ink-soft)', marginTop: 6 }}>
                    This payment will be recorded against{' '}
                    <strong>{accountsUser?.name || accountsUser?.login_id || accountsUser?.email || 'you'}</strong>.
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button className="rem-btn" onClick={() => { setShowComplete(false); setCompleteId(null) }}>Cancel</button>
              {txnStep ? (
                <button className="rem-btn primary" onClick={doComplete}>
                  <Icon name="check" size={14} /> Confirm Payment
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {alarmToasts.map(t => (
        <AlarmToast
          key={`${t.reminderId}-${t.alarmType}`}
          reminder={t.reminder}
          alarmType={t.alarmType}
          onDismiss={() => dismissAlarm(`${t.reminderId}-${t.alarmType}`)}
          onComplete={() => handleComplete(t.reminderId)}
          onSnooze={(min) => handleSnooze(t.reminderId, min)}
          onView={() => { setActiveFilter(''); navigate(REM_HOME); dismissAlarm(`${t.reminderId}-${t.alarmType}`) }}
        />
      ))}
    </div>
  )
}

export default function ReminderPanel() {
  return (
    <RemProvider>
      <PanelInner />
    </RemProvider>
  )
}