import { useEffect, useMemo, useState } from 'react'
import gsap from 'gsap'
import {
  Tag, Plus, Search, Send, Pencil, Trash2, Power, Loader2, X, RefreshCw, Copy, Users, CheckCircle2
} from 'lucide-react'
import StatCard from './StatCard.jsx'
import { useToast } from './toast.jsx'
import { listCoupons, createCoupon, updateCoupon, deleteCoupon, sendCouponEmail } from '../api.js'
import { formatDate } from '../formUtils.js'

const TODAY = new Date().toISOString().slice(0, 10)

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = ['SEV']
  for (let i = 0; i < 4; i++) arr.push(chars[Math.floor(Math.random() * chars.length)])
  return arr.join('')
}

function couponStatus(c) {
  if (c.valid_until && c.valid_until < TODAY) return 'expired'
  if (!c.active) return 'inactive'
  if (c.max_uses != null && (c.uses_count || 0) >= c.max_uses) return 'used'
  return 'active'
}

const STATUS_META = {
  active: { label: 'Active', cls: 'active' },
  expired: { label: 'Expired', cls: 'expired' },
  used: { label: 'Used up', cls: 'used' },
  inactive: { label: 'Inactive', cls: 'inactive' }
}

const FILTERS = ['ALL', 'ACTIVE', 'EXPIRED', 'USED', 'INACTIVE']
const FILTER_LABELS = { ALL: 'All', ACTIVE: 'Active', EXPIRED: 'Expired', USED: 'Used up', INACTIVE: 'Inactive' }

function discountLabel(c) {
  return c.discount_type === 'flat' ? `Rs. ${c.discount_value} off` : `${c.discount_value}% off`
}

function validityLabel(c) {
  if (c.valid_from && c.valid_until) return `${formatDate(c.valid_from)} → ${formatDate(c.valid_until)}`
  if (c.valid_from) return `From ${formatDate(c.valid_from)}`
  if (c.valid_until) return `Until ${formatDate(c.valid_until)}`
  return 'No expiry'
}

function blankForm() {
  return {
    code: '',
    description: '',
    discount_type: 'percent',
    discount_value: '',
    min_fee: '',
    valid_from: '',
    valid_until: '',
    max_uses: '',
    active: true
  }
}

export default function Coupons({ rows }) {
  const toast = useToast()
  const [coupons, setCoupons] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankForm)
  const [formErr, setFormErr] = useState({})
  const [saving, setSaving] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendCoupon, setSendCoupon] = useState(null)
  const [memberQ, setMemberQ] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [sendBusy, setSendBusy] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const load = async () => {
    try {
      setCoupons(await listCoupons())
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!coupons || coupons.length === 0) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        document.querySelectorAll('.coupon-row'),
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.04, ease: 'power2.out', overwrite: true }
      )
    })
    return () => ctx.revert()
  }, [coupons, q, filter])

  const members = useMemo(() => (rows || []).filter((r) => r.status === 'APPROVED' && r.email), [rows])

  const filtered = useMemo(() => {
    let list = coupons || []
    if (q.trim()) {
      const term = q.trim().toLowerCase()
      list = list.filter((c) =>
        [c.code, c.description, c.discount_type, String(c.discount_value)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      )
    }
    if (filter !== 'ALL') list = list.filter((c) => couponStatus(c) === filter.toLowerCase())
    return list
  }, [coupons, q, filter])

  const stats = useMemo(() => {
    const total = coupons ? coupons.length : 0
    const active = coupons ? coupons.filter((c) => couponStatus(c) === 'active').length : 0
    const expiring = coupons
      ? coupons.filter((c) => c.valid_until && c.valid_until >= TODAY && c.valid_until <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length
      : 0
    const redemptions = coupons ? coupons.reduce((s, c) => s + (Number(c.uses_count) || 0), 0) : 0
    return { total, active, expiring, redemptions }
  }, [coupons])

  const filteredMembers = useMemo(() => {
    if (!memberQ.trim()) return members
    const term = memberQ.trim().toLowerCase()
    return members.filter((m) =>
      [m.full_name, m.email, m.membership_id, m.ref].filter(Boolean).some((v) => String(v).toLowerCase().includes(term))
    )
  }, [members, memberQ])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...blankForm(), code: randomCode() })
    setFormErr({})
    setFormOpen(true)
  }

  const openEdit = (c) => {
    setEditing(c)
    setForm({
      code: c.code,
      description: c.description || '',
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      min_fee: c.min_fee != null ? String(c.min_fee) : '',
      valid_from: c.valid_from || '',
      valid_until: c.valid_until || '',
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      active: c.active
    })
    setFormErr({})
    setFormOpen(true)
  }

  const setF = (k, v) => setForm((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    const errs = {}
    const code = form.code.trim().toUpperCase()
    if (!code) errs.code = 'Coupon code is required.'
    else if (coupons.some((c) => c.id !== (editing && editing.id) && c.code.toUpperCase() === code)) {
      errs.code = 'This coupon code already exists.'
    }
    if (!form.discount_value || Number(form.discount_value) <= 0) errs.discount_value = 'Enter a discount value greater than 0.'
    if (form.valid_from && form.valid_until && form.valid_until < form.valid_from) errs.valid_until = 'End date cannot be before the start date.'
    if (form.max_uses !== '' && Number(form.max_uses) < 0) errs.max_uses = 'Max uses cannot be negative.'
    setFormErr(errs)
    if (Object.values(errs).some(Boolean)) return

    const payload = {
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_fee: form.min_fee !== '' ? Number(form.min_fee) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      max_uses: form.max_uses !== '' ? Number(form.max_uses) : null,
      active: form.active
    }

    setSaving(true)
    try {
      if (editing) {
        await updateCoupon(editing.id, payload)
        toast('Coupon updated.')
      } else {
        await createCoupon(payload)
        toast('Coupon created.')
      }
      setFormOpen(false)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setSaving(false)
  }

  const toggle = async (c) => {
    setTogglingId(c.id)
    try {
      await updateCoupon(c.id, { active: !c.active })
      toast(c.active ? 'Coupon deactivated.' : 'Coupon activated.')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setTogglingId(null)
  }

  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return
    setDeletingId(c.id)
    try {
      await deleteCoupon(c.id)
      toast('Coupon deleted.')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
    setDeletingId(null)
  }

  const openSend = (c) => {
    setSendCoupon(c)
    setMemberQ('')
    setSelected(new Set())
    setSendOpen(true)
  }

  const toggleMember = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(filteredMembers.map((m) => m.id)))
  const clearAll = () => setSelected(new Set())

  const doSend = async () => {
    const ids = [...selected]
    if (ids.length === 0) {
      toast('Select at least one member.', 'error')
      return
    }
    setSendBusy(true)
    try {
      const res = await sendCouponEmail(sendCoupon.id, ids)
      const results = res.results || []
      const sentCount = results.filter((r) => r.sent).length
      toast(`Coupon sent to ${sentCount} of ${results.length} member(s).`)
      setSendOpen(false)
    } catch (e) {
      toast(e.message, 'error')
    }
    setSendBusy(false)
  }

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      toast(`Copied ${code}.`)
    } catch {
      toast('Could not copy.', 'error')
    }
  }

  return (
    <div className="admin-view">
      <div className="admin-view-head">
        <div>
          <h2>Coupons</h2>
          <p className="admin-sub">Create discount codes and email them to members</p>
        </div>
        <div className="admin-view-head-btns">
          <button className="btn-export" onClick={openCreate}>
            <Plus size={15} /> New coupon
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={<Tag size={20} />} label="Total coupons" value={stats.total} color="#0ea5e9" delay={0} />
        <StatCard icon={<CheckCircle2 size={20} />} label="Active" value={stats.active} color="#22c55e" delay={0.06} />
        <StatCard icon={<Users size={20} />} label="Expiring in 7 days" value={stats.expiring} color="#f59e0b" delay={0.12} />
        <StatCard icon={<Send size={20} />} label="Redemptions" value={stats.redemptions} color="#8b5cf6" delay={0.18} />
      </div>

      <div className="app-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, description, discount..." />
        </div>
      </div>

      <div className="status-chips">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {FILTER_LABELS[f]}
            <span>
              {f === 'ALL'
                ? (coupons || []).length
                : (coupons || []).filter((c) => couponStatus(c) === f.toLowerCase()).length}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="admin-empty">{error}</p>}

      <div className="app-table-wrap">
        {!coupons ? (
          <div className="admin-loading"><Loader2 size={24} className="spin" /><p>Loading coupons...</p></div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty-block">
            <Tag size={34} />
            <p>No coupons found. Create your first coupon.</p>
          </div>
        ) : (
          <table className="app-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Validity</th>
                <th>Uses</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = couponStatus(c)
                const sm = STATUS_META[st]
                const usesLabel = c.max_uses != null ? `${c.uses_count || 0} / ${c.max_uses}` : String(c.uses_count || 0)
                return (
                  <tr key={c.id} className="coupon-row">
                    <td>
                      <div className="coupon-code-cell">
                        <span className="coupon-code">{c.code}</span>
                        <button className="coupon-copy" onClick={() => copyCode(c.code)} aria-label="Copy code">
                          <Copy size={13} />
                        </button>
                        {c.description && <small className="coupon-desc">{c.description}</small>}
                      </div>
                    </td>
                    <td><strong>{discountLabel(c)}</strong>{c.min_fee != null && <div className="muted-td">min fee Rs. {c.min_fee}</div>}</td>
                    <td className="muted-td">{validityLabel(c)}</td>
                    <td className="mono">{usesLabel}</td>
                    <td><span className={`admin-badge coupon-st ${sm.cls}`}>{sm.label}</span></td>
                    <td>
                      <div className="coupon-actions">
                        <button className="btn-act send" onClick={() => openSend(c)} disabled={st !== 'active'}>
                          <Send size={13} /> Send
                        </button>
                        <button className="btn-act" onClick={() => openEdit(c)} disabled={!!togglingId || !!deletingId}>
                          <Pencil size={13} />
                        </button>
                        <button className="btn-act" onClick={() => toggle(c)} disabled={!!togglingId || !!deletingId} aria-label="Toggle active">
                          {togglingId === c.id ? <Loader2 size={13} className="spin" /> : <Power size={13} />}
                        </button>
                        <button className="btn-act danger" onClick={() => remove(c)} disabled={!!togglingId || !!deletingId}>
                          {deletingId === c.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <div className="modal-overlay" onClick={() => !saving && setFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing ? `Edit coupon · ${editing.code}` : 'New coupon'}</h3>
              <button className="drawer-close" onClick={() => setFormOpen(false)} aria-label="Close">
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <div className="coupon-form-grid">
                <div className="edit-field">
                  <span className="edit-label">Coupon code</span>
                  <div className="code-input-row">
                    <input
                      value={form.code}
                      onChange={(e) => setF('code', e.target.value.toUpperCase())}
                      placeholder="e.g. SAVE10"
                      className="mono"
                    />
                    <button type="button" className="doc-replace-btn" onClick={() => setF('code', randomCode())} title="Generate code">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                  {formErr.code && <span className="edit-error">{formErr.code}</span>}
                </div>

                <div className="edit-field">
                  <span className="edit-label">Description</span>
                  <input
                    value={form.description}
                    onChange={(e) => setF('description', e.target.value)}
                    placeholder="e.g. Renewal discount for members"
                  />
                </div>

                <div className="edit-field">
                  <span className="edit-label">Discount type</span>
                  <div className="discount-type-row">
                    <button
                      type="button"
                      className={`discount-type-btn ${form.discount_type === 'percent' ? 'active' : ''}`}
                      onClick={() => setF('discount_type', 'percent')}
                    >
                      Percentage (%)
                    </button>
                    <button
                      type="button"
                      className={`discount-type-btn ${form.discount_type === 'flat' ? 'active' : ''}`}
                      onClick={() => setF('discount_type', 'flat')}
                    >
                      Flat amount (Rs.)
                    </button>
                  </div>
                </div>

                <div className="edit-field">
                  <span className="edit-label">{form.discount_type === 'percent' ? 'Discount value (%)' : 'Discount value (Rs.)'}</span>
                  <input
                    type="number"
                    min="0"
                    value={form.discount_value}
                    onChange={(e) => setF('discount_value', e.target.value)}
                    placeholder="e.g. 10"
                  />
                  {formErr.discount_value && <span className="edit-error">{formErr.discount_value}</span>}
                </div>

                <div className="edit-field">
                  <span className="edit-label">Minimum fee (optional)</span>
                  <input
                    type="number"
                    min="0"
                    value={form.min_fee}
                    onChange={(e) => setF('min_fee', e.target.value)}
                    placeholder="e.g. 1650"
                  />
                </div>

                <div className="edit-field">
                  <span className="edit-label">Valid from (optional)</span>
                  <input type="date" value={form.valid_from} onChange={(e) => setF('valid_from', e.target.value)} />
                </div>

                <div className="edit-field">
                  <span className="edit-label">Valid until (optional)</span>
                  <input type="date" value={form.valid_until} onChange={(e) => setF('valid_until', e.target.value)} />
                  {formErr.valid_until && <span className="edit-error">{formErr.valid_until}</span>}
                </div>

                <div className="edit-field">
                  <span className="edit-label">Max uses (optional)</span>
                  <input
                    type="number"
                    min="0"
                    value={form.max_uses}
                    onChange={(e) => setF('max_uses', e.target.value)}
                    placeholder="Leave empty for unlimited"
                  />
                  {formErr.max_uses && <span className="edit-error">{formErr.max_uses}</span>}
                </div>

                <label className="edit-field checkbox-field">
                  <span className="edit-label">Active</span>
                  <label className="switch-row">
                    <input type="checkbox" checked={form.active} onChange={(e) => setF('active', e.target.checked)} />
                    <span>{form.active ? 'Coupon is active and can be sent' : 'Coupon is inactive'}</span>
                  </label>
                </label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-act" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn-act approve" onClick={save} disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {editing ? 'Save changes' : 'Create coupon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendOpen && sendCoupon && (
        <div className="modal-overlay" onClick={() => !sendBusy && setSendOpen(false)}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Send coupon <span className="coupon-code">{sendCoupon.code}</span></h3>
              <button className="drawer-close" onClick={() => setSendOpen(false)} aria-label="Close">
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <p className="admin-sub">Send this coupon to existing approved members. Each member receives the code by email.</p>
              <div className="search-box send-search">
                <Search size={15} />
                <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Search member name, email, membership ID..." />
              </div>
              <div className="send-toolbar">
                <span className="admin-sub">{selected.size} selected · {members.length} members total</span>
                <div className="send-toolbar-btns">
                  <button className="btn-act" onClick={selectAll}>Select all</button>
                  <button className="btn-act" onClick={clearAll} disabled={selected.size === 0}>Clear</button>
                </div>
              </div>
              <div className="member-picker">
                {filteredMembers.length === 0 ? (
                  <p className="admin-empty">No approved members match the search.</p>
                ) : (
                  filteredMembers.map((m) => (
                    <label key={m.id} className="member-row">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleMember(m.id)}
                      />
                      <span className="cell-avatar">{m.full_name ? m.full_name.charAt(0).toUpperCase() : '?'}</span>
                      <span className="member-main">
                        <strong>{m.full_name}</strong>
                        <small>{m.email}{m.membership_id ? ` · ${m.membership_id}` : ''}</small>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-act" onClick={() => setSendOpen(false)} disabled={sendBusy}>Cancel</button>
              <button className="btn-act approve" onClick={doSend} disabled={sendBusy || selected.size === 0}>
                {sendBusy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                {sendBusy ? `Sending to ${selected.size}...` : `Send to ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
