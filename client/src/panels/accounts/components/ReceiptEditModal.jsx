import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil } from 'lucide-react'
import { apiGet, apiPatch } from '../api/auth'

// Shared "Edit Receipt" modal. Used by Receipt History and the Donor Data
// Update receipts table so both screens edit a receipt the same way: same
// fields, same FRO-change safeguard, same credit rules.
//
// The form only PATCHes the fields that actually changed. The backend merges
// the rest, so an untouched field can never be rewritten by a stray form
// default.

const currency = n => n != null && n !== '' ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u2014'

const editInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 9,
  border: '1px solid var(--line, #d1d5db)', fontSize: 12.5, fontFamily: 'inherit',
  background: '#fff', outline: 'none', color: 'var(--ink)',
}

const FIELDS = [
  { label: 'Donor Name', key: 'donor_name', colSpan: 2 },
  { label: 'Amount', key: 'amount', colSpan: 2, type: 'number' },
  { label: 'Mobile', key: 'donor_mobile' },
  { label: 'Mobile 2', key: 'mobile_2' },
  { label: 'Address', key: 'address', colSpan: 2, type: 'textarea' },
  { label: 'Address 2', key: 'address_2', colSpan: 2, type: 'textarea' },
  { label: 'PAN Number', key: 'pan_number' },
  { label: 'Email', key: 'email' },
  { label: 'FRO / Agent', key: 'agent_name', type: 'select' },
  { label: 'Mode of Payment', key: 'mode', type: 'mop' },
  { label: 'Payment ID', key: 'payment_id' },
  { label: 'Received Bank', key: 'received_bank', type: 'sources' },
  { label: 'Receipt Date', key: 'receipt_date', type: 'date' },
  { label: 'Receipt Time', key: 'receipt_time', type: 'time' },
]

const FIELD_LABELS = FIELDS.reduce((m, f) => ({ ...m, [f.key]: f.label }), {})

const dateOnly = v => (v ? String(v).slice(0, 10) : '')

const buildForm = (r) => ({
  donor_name: r.donor_name || '',
  amount: r.amount == null ? '' : String(r.amount),
  donor_mobile: r.donor_mobile || '',
  mobile_2: r.mobile_2 || '',
  address: r.address || '',
  address_2: r.address_2 || '',
  pan_number: r.pan_number || '',
  email: r.email || '',
  agent_name: r.agent_name || '',
  mode: r.mode || '',
  payment_id: r.payment_id || '',
  received_bank: r.received_bank || '',
  receipt_date: dateOnly(r.receipt_date),
  receipt_time: r.receipt_time || '',
})

// The stored row and the form can spell the same value differently (a date
// with a time zone, a numeric amount as a number). Compare on the form's
// terms so "nothing changed" really means nothing is sent.
const normalize = (key, value) => {
  if (key === 'receipt_date') return dateOnly(value)
  if (value == null) return ''
  return String(value).trim()
}

export default function ReceiptEditModal({ receipt, focusField = '', onClose, onSaved, contextLabel = '' }) {
  const [form, setForm] = useState(() => buildForm(receipt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmFroChange, setConfirmFroChange] = useState(false)
  const [froWorkers, setFroWorkers] = useState([])
  const [sources, setSources] = useState([])
  const inputRefs = useRef({})

  // Rebuild the form only when a different receipt is opened.
  useEffect(() => {
    setForm(buildForm(receipt))
    setError('')
    setConfirmFroChange(false)
  }, [receipt?.id])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiGet('/accounts/receipts/fro-workers').catch(() => []),
      apiGet('/accounts/bank-audit/sources').catch(() => []),
    ]).then(([workers, srcs]) => {
      if (cancelled) return
      setFroWorkers(Array.isArray(workers) ? workers : [])
      setSources(Array.isArray(srcs) ? srcs : [])
    })
    return () => { cancelled = true }
  }, [])

  // Put the cursor on the field the user actually aimed at (the cell they
  // hovered) instead of making them hunt for it.
  useEffect(() => {
    const key = focusField && form[focusField] !== undefined ? focusField : ''
    if (!key) return
    const t = setTimeout(() => {
      const el = inputRefs.current[key]
      if (!el) return
      el.scrollIntoView({ block: 'center' })
      el.focus()
      if (typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* select/date inputs */ }
      }
    }, 60)
    return () => clearTimeout(t)
  }, [receipt?.id, focusField])

  const originalOf = (key) => normalize(key, receipt?.[key])

  const changes = useMemo(() => {
    const out = {}
    for (const { key } of FIELDS) {
      if (normalize(key, form[key]) !== originalOf(key)) out[key] = form[key]
    }
    return out
  }, [form, receipt])

  const dirty = Object.keys(changes).length > 0

  const requestClose = () => {
    if (confirmFroChange && !saving) { setConfirmFroChange(false); return }
    if (dirty && !window.confirm('Discard your changes to this receipt?')) return
    onClose?.()
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); requestClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const save = async () => {
    if (!dirty || saving) return
    if ('amount' in changes) {
      const parsed = parseFloat(changes.amount)
      if (Number.isNaN(parsed) || parsed < 0) { setError('Amount must be a number of 0 or more.'); return }
    }
    const oldFro = String(receipt?.agent_name || '').trim()
    const newFro = 'agent_name' in changes ? String(changes.agent_name || '').trim() : oldFro
    if ('agent_name' in changes && oldFro !== newFro && newFro !== '' && !confirmFroChange) {
      setConfirmFroChange(true)
      return
    }
    setSaving(true)
    setError('')
    try {
      await apiPatch(`/accounts/receipts/${receipt.id}`, changes)
      setConfirmFroChange(false)
      onSaved?.(changes)
    } catch (err) {
      setError(err.message || 'Unable to save receipt')
      setSaving(false)
    }
  }

  const onFormKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      save()
    }
  }

  const modeList = useMemo(() => {
    const dbMops = sources.filter(s => s.kind === 'mop' && s.is_active !== false).map(s => s.name).filter(Boolean)
    return [...new Set([...dbMops, 'UPI', 'Cash', 'Cheque', 'Bank Transfer', 'NEFT', 'RTGS'])]
  }, [sources])

  const renderInput = ({ key, type }) => {
    const set = (v) => { setForm(f => ({ ...f, [key]: v })); setError(''); setConfirmFroChange(false) }
    const common = {
      ref: el => { inputRefs.current[key] = el },
      style: editInputStyle,
      'aria-label': FIELD_LABELS[key],
    }
    if (type === 'select') {
      const cur = form[key] || ''
      const opts = froWorkers.map(w => w.name).filter(Boolean)
      const known = new Set(opts)
      return (
        <select {...common} value={cur} onChange={e => set(e.target.value)}>
          <option value="">Not assigned</option>
          {opts.map(name => <option key={name} value={name}>{name}</option>)}
          {cur && !known.has(cur) && <option value={cur}>{cur} (current)</option>}
        </select>
      )
    }
    if (type === 'mop') {
      const cur = form[key] || ''
      return (
        <select {...common} value={cur} onChange={e => set(e.target.value)}>
          <option value="">{'—'}</option>
          {modeList.map(m => <option key={m} value={m}>{m}</option>)}
          {cur && !modeList.includes(cur) && <option value={cur}>{cur} (current)</option>}
        </select>
      )
    }
    if (type === 'sources') {
      return (
        <select {...common} value={form[key] || ''} onChange={e => set(e.target.value)}>
          <option value="">{'—'}</option>
          {sources.map(s => (
            <option key={s.id} value={s.name}>
              {s.name}{(s.kind || 'bank') === 'mop' ? ' (MOP)' : ''}{s.is_active === false ? ' (inactive)' : ''}
            </option>
          ))}
        </select>
      )
    }
    if (type === 'textarea') {
      return (
        <textarea
          {...common}
          value={form[key] || ''}
          onChange={e => set(e.target.value)}
          rows={2}
          style={{ ...editInputStyle, resize: 'vertical', minHeight: 62 }}
        />
      )
    }
    if (type === 'date') {
      return <input {...common} type="date" value={dateOnly(form[key])} onChange={e => set(e.target.value)} />
    }
    if (type === 'time') {
      return <input {...common} type="text" placeholder="HH:MM" value={form[key] || ''} onChange={e => set(e.target.value)} />
    }
    if (type === 'number') {
      return <input {...common} type="number" min="0" step="0.01" value={form[key] || ''} onChange={e => set(e.target.value)} />
    }
    return <input {...common} type={key === 'email' ? 'email' : 'text'} value={form[key] || ''} onChange={e => set(e.target.value)} />
  }

  return createPortal(
    <div
      className="rx-edit-overlay"
      onClick={requestClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
        // The portal lives outside .panel-accounts, so carry the accounts
        // panel tokens with it instead of inheriting whatever the body has.
        '--ink': '#1a1a2e', '--ink-soft': '#6b7280',
        '--line': '#e5e7eb', '--sage': '#5B6B4E',
      }}
    >
      <div
        className="rx-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit receipt ${receipt.receipt_no || ''}`}
        onKeyDown={onFormKeyDown}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', maxWidth: 620, width: '100%',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(15,23,42,.25)',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Pencil size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Edit Receipt</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Receipt <b>{receipt.receipt_no || '\u2014'}</b>
                {receipt.donor_name ? ` \u00B7 ${receipt.donor_name}` : ''}
                {focusField && FIELD_LABELS[focusField] ? ` \u00B7 ${contextLabel || FIELD_LABELS[focusField]}` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            title="Close"
            style={{ border: 'none', background: 'transparent', color: 'var(--ink-soft)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="modal-body" style={{ padding: 18, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {receipt.verify_type === 'cross_fro' && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Cross-FRO Receipt</div>
              <div>Credit went to <strong>{froWorkers.find(w => w.id === receipt.verify_fro_worker_id)?.name || 'the verifier'}</strong>, not <strong>{receipt.agent_name || 'the owner'}</strong>. Changing the FRO/Agent will update the receipt but credit stays with the verifier.</div>
            </div>
          )}
          {confirmFroChange && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
              <strong>FRO Change Detected</strong><br />
              Credit of {currency(receipt.amount)} will be reversed from <strong>{receipt.agent_name || '\u2014'}</strong> and applied to <strong>{form.agent_name}</strong>.
            </div>
          )}
          {(receipt.received_bank || receipt.audit_payer_name) && (
            <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#3730a3' }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Linked bank-audit entry</div>
              {receipt.received_bank && <div>Source (Received Bank): <strong>{receipt.received_bank}</strong></div>}
              {receipt.audit_payer_name && <div>Payer as per audit: <strong>{receipt.audit_payer_name}</strong></div>}
            </div>
          )}
          {error && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#b91c1c' }}>
              {error}
            </div>
          )}

          <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: '#f8fafc', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
              Receipt details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 16 }}>
              {FIELDS.map(({ label, key, colSpan, type }) => (
                <label key={key} style={{ gridColumn: colSpan === 2 ? '1 / -1' : undefined, fontSize: 10, color: 'var(--ink-soft)', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {label}
                  {renderInput({ key, type })}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fff', flexShrink: 0 }}>
          <button
            type="button"
            onClick={requestClose}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--line)', background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            title={!dirty ? 'No changes to save' : undefined}
            style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: confirmFroChange ? '#f59e0b' : '#059669', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: saving || !dirty ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving || !dirty ? 0.6 : 1 }}
          >
            {saving ? 'Saving\u2026' : confirmFroChange ? 'Confirm & Save' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
