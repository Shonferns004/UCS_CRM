import { useEffect, useRef, useState } from 'react'
import {
  X, ShieldCheck, BadgeCheck, Mail, MessageCircle, Ban, Trash2, ExternalLink, Loader2, CheckCircle2, XCircle, Hourglass, FileText, Pencil, Check, ImagePlus
} from 'lucide-react'
import {
  getFileUrl, rejectApplication, deleteApplication, resendMembershipEmail, sendPaymentReminder,
  updateApplication, uploadApplicationPhoto, deleteApplicationPhoto
} from '../api.js'
import { pdfMemberDoc } from './MembershipFormDoc.jsx'
import { supabase } from '../supabaseClient.js'
import { statusLabel } from './meta.js'
import { formatINR, formatDate, computeEndDate } from '../formUtils.js'
import { MEMBERSHIP_PRICES, INDIA_STATES } from '../formConfig.js'
import { validateField, validateIdentityDocument } from '../validate.js'
import { useToast } from './toast.jsx'

const steps = ['SUBMITTED', 'PAYMENT_SUBMITTED', 'VERIFIED', 'APPROVED']
const stepIcon = {
  SUBMITTED: <Hourglass size={14} />,
  PAYMENT_SUBMITTED: <ShieldCheck size={14} />,
  VERIFIED: <BadgeCheck size={14} />,
  APPROVED: <CheckCircle2 size={14} />
}

const PLAN_OPTIONS = ['Daily', 'Half Monthly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annual']
const GENDER_OPTIONS = ['Male', 'Female', 'Other']
const ID_PROOF_OPTIONS = ['Aadhaar Card', 'PAN Card', 'Driving Licence', 'Passport', 'Student ID', 'Other']

const EDIT_FIELDS = [
  { id: 'membershipType', label: 'Membership Plan', input: 'select', type: 'radio', options: PLAN_OPTIONS },
  { id: 'startDate', label: 'Start Date', input: 'date', type: 'date' },
  { id: 'endDate', label: 'End Date', input: 'date', type: 'date' },
  { id: 'membershipFee', label: 'Membership Fee', input: 'text', type: 'text', pattern: '^[0-9]+(\\.[0-9]{1,2})?$', errorMsg: 'Please enter a valid fee amount.' },
  { id: 'fullName', label: 'Full Name', input: 'text', type: 'text' },
  { id: 'guardianName', label: "Guardian's Name", input: 'text', type: 'text' },
  { id: 'dateOfBirth', label: 'Date of Birth', input: 'date', type: 'date' },
  { id: 'gender', label: 'Gender', input: 'select', type: 'radio', options: GENDER_OPTIONS },
  { id: 'occupation', label: 'Occupation', input: 'text', type: 'text' },
  { id: 'educationalQualification', label: 'Educational Qualification', input: 'text', type: 'text' },
  { id: 'mobileNumber', label: 'Mobile Number', input: 'text', type: 'tel', pattern: '^[0-9]{10}$', errorMsg: 'Please enter a valid 10-digit mobile number.' },
  { id: 'alternateMobileNumber', label: 'Alternate Mobile Number', input: 'text', type: 'tel', pattern: '^[0-9]{10}$', errorMsg: 'Please enter a valid 10-digit mobile number.' },
  { id: 'emailAddress', label: 'Email Address', input: 'email', type: 'email' },
  { id: 'currentAddress', label: 'Current Address', input: 'textarea', type: 'textarea' },
  { id: 'city', label: 'City', input: 'text', type: 'text' },
  { id: 'state', label: 'State', input: 'select', type: 'select', options: INDIA_STATES },
  { id: 'pinCode', label: 'PIN Code', input: 'text', type: 'tel', pattern: '^[0-9]{6}$', errorMsg: 'Please enter a valid 6-digit PIN code.' },
  { id: 'identityProofType', label: 'Identity Proof Type', input: 'select', type: 'radio', options: ID_PROOF_OPTIONS },
  { id: 'identityNumber', label: 'Identity Number', input: 'text', type: 'text' },
  { id: 'applicantSignature', label: 'Applicant Signature', input: 'text', type: 'text' }
]

function buildEditValues(row) {
  const d = row.data || {}
  const v = {}
  EDIT_FIELDS.forEach((f) => {
    v[f.id] = d[f.id] ?? ''
  })
  v.transactionId = row.transaction_id || ''
  return v
}

const DRAFT_KEY = 'sevakAdminEditDraft'
const DRAFT_TTL = 24 * 60 * 60 * 1000

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}
  } catch {
    return {}
  }
}

function writeDrafts(map) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(map))
  } catch {
    // storage unavailable - drafts are best-effort only
  }
}

function getDraft(appId) {
  const map = readDrafts()
  const d = map[String(appId)]
  if (!d) return null
  if (Date.now() - (d.at || 0) > DRAFT_TTL) {
    const m = readDrafts()
    delete m[String(appId)]
    writeDrafts(m)
    return null
  }
  return d
}

function saveDraft(appId, draft) {
  const map = readDrafts()
  map[String(appId)] = draft
  Object.keys(map).forEach((k) => {
    if (Date.now() - (map[k].at || 0) > DRAFT_TTL) delete map[k]
  })
  writeDrafts(map)
}

function clearDraft(appId) {
  const map = readDrafts()
  delete map[String(appId)]
  writeDrafts(map)
}

export default function ApplicationDetail({ row, onClose, refresh }) {
  const toast = useToast()
  const [files, setFiles] = useState({ passport: null, identity: null })
  const [busy, setBusy] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState(() => buildEditValues(row))
  const [editErrors, setEditErrors] = useState({})
  const [newPhotos, setNewPhotos] = useState({ passport: null, identity: null })
  const [newPhotoPrev, setNewPhotoPrev] = useState({ passport: null, identity: null })
  const [newPhotoErr, setNewPhotoErr] = useState({ passport: '', identity: '' })
  const baseUpdatedAt = useRef(null)
  const previewUrls = useRef({ passport: null, identity: null })

  const d = row.data || {}

  useEffect(() => {
    let on = true
    getFileUrl(row.passport_photo).then((u) => on && setFiles((f) => ({ ...f, passport: u })))
    getFileUrl(row.identity_photo).then((u) => on && setFiles((f) => ({ ...f, identity: u })))
    return () => (on = false)
  }, [row])

  useEffect(() => {
    return () => {
      Object.values(previewUrls.current).forEach((u) => u && URL.revokeObjectURL(u))
    }
  }, [])

  const handleEditChange = (id, value) => {
    const next = { ...editValues, [id]: value }
    if (id === 'membershipType' && value && MEMBERSHIP_PRICES[value]) {
      next.membershipFee = MEMBERSHIP_PRICES[value]
    }
    if (id === 'membershipType' || id === 'startDate') {
      next.endDate = computeEndDate(next.startDate, next.membershipType)
    }
    setEditValues(next)
    saveDraft(row.id, { baseUpdatedAt: baseUpdatedAt.current, values: next, at: Date.now() })

    const field = EDIT_FIELDS.find((f) => f.id === id)
    if (field) {
      const err = validateField(field, value, next)
      setEditErrors((prev) => ({ ...prev, [id]: err }))
    }
  }

  const resetPhotos = () => {
    Object.values(previewUrls.current).forEach((u) => u && URL.revokeObjectURL(u))
    previewUrls.current = { passport: null, identity: null }
    setNewPhotos({ passport: null, identity: null })
    setNewPhotoPrev({ passport: null, identity: null })
    setNewPhotoErr({ passport: '', identity: '' })
  }

  const onPhotoChange = async (key, file) => {
    if (!file) return
    const err = await validateIdentityDocument(file)
    if (err) {
      setNewPhotoErr((prev) => ({ ...prev, [key]: err }))
      setNewPhotos((prev) => ({ ...prev, [key]: null }))
      return
    }
    if (previewUrls.current[key]) URL.revokeObjectURL(previewUrls.current[key])
    const url = URL.createObjectURL(file)
    previewUrls.current = { ...previewUrls.current, [key]: url }
    setNewPhotoPrev((prev) => ({ ...prev, [key]: url }))
    setNewPhotos((prev) => ({ ...prev, [key]: file }))
    setNewPhotoErr((prev) => ({ ...prev, [key]: '' }))
  }

  const clearNewPhoto = (key) => {
    if (previewUrls.current[key]) URL.revokeObjectURL(previewUrls.current[key])
    previewUrls.current = { ...previewUrls.current, [key]: null }
    setNewPhotoPrev((prev) => ({ ...prev, [key]: null }))
    setNewPhotos((prev) => ({ ...prev, [key]: null }))
    setNewPhotoErr((prev) => ({ ...prev, [key]: '' }))
  }

  const startEdit = () => {
    const draft = getDraft(row.id)
    if (draft && draft.values && draft.baseUpdatedAt === row.updated_at) {
      setEditValues({ ...draft.values })
      toast('Restored unsaved edits from your last session.')
    } else {
      setEditValues(buildEditValues(row))
    }
    baseUpdatedAt.current = row.updated_at || null
    setEditErrors({})
    resetPhotos()
    setEditing(true)
  }

  const cancelEdit = () => {
    clearDraft(row.id)
    setEditValues(buildEditValues(row))
    setEditErrors({})
    resetPhotos()
    setEditing(false)
  }

  const saveEdit = async () => {
    const errs = {}
    EDIT_FIELDS.forEach((f) => {
      const e = validateField(f, editValues[f.id], editValues)
      if (e) errs[f.id] = e
    })
    if (newPhotoErr.passport || newPhotoErr.identity) {
      toast('Please check the selected photos.', 'error')
      return
    }
    if (Object.values(errs).some(Boolean)) {
      setEditErrors(errs)
      toast('Please fix the highlighted fields.', 'error')
      return
    }
    setBusy('save')
    const uploaded = []
    try {
      const photos = {}
      if (newPhotos.passport) {
        photos.passport = await uploadApplicationPhoto(row.ref, 'passport', newPhotos.passport)
        uploaded.push(photos.passport)
      }
      if (newPhotos.identity) {
        photos.identity = await uploadApplicationPhoto(row.ref, 'identity', newPhotos.identity)
        uploaded.push(photos.identity)
      }
      const oldPassport = row.passport_photo
      const oldIdentity = row.identity_photo
      await updateApplication(row.id, editValues, editValues.transactionId, photos)
      clearDraft(row.id)
      const cleanup = []
      if (photos.passport && oldPassport) cleanup.push(deleteApplicationPhoto(oldPassport))
      if (photos.identity && oldIdentity) cleanup.push(deleteApplicationPhoto(oldIdentity))
      Promise.allSettled(cleanup)
      toast('Application details updated.')
      setEditing(false)
      resetPhotos()
      refresh()
    } catch (e) {
      uploaded.forEach((p) => deleteApplicationPhoto(p).catch(() => {}))
      toast(e.message, 'error')
    }
    setBusy('')
  }

  const verify = async () => {
    setBusy('verify')
    const { error } = await supabase.rpc('mark_payment_verified', { p_id: row.id })
    if (error) toast(error.message, 'error')
    else {
      toast('Payment verified.')
      refresh()
      onClose()
    }
    setBusy('')
  }

  const approve = async () => {
    setBusy('approve')
    const { data, error } = await supabase.rpc('approve_application', { p_id: row.id })
    if (error) {
      toast(error.message, 'error')
      setBusy('')
      return
    }
    setBusy('')
    toast(`Membership ${data.membership_id} issued.`)
    refresh()
    onClose()
    resendMembershipEmail(row.id)
      .then(() => toast('Membership email sent.'))
      .catch((e) => toast(`Membership issued, but email failed: ${e.message}`, 'error'))
  }

  const sendReminder = async () => {
    setBusy('reminder')
    try {
      await sendPaymentReminder(row.id)
      toast('Payment reminder email sent.')
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy('')
  }

  const printPdf = async () => {
    setBusy('pdf')
    try {
      await pdfMemberDoc([row], [files.passport])
      toast('Membership registration PDF downloaded.')
    } catch (e) {
      toast(`Could not generate PDF: ${e.message}`, 'error')
    }
    setBusy('')
  }

  const m = row.mobile ? row.mobile.replace(/\D/g, '') : ''
  const waNumber = m.length === 10 ? `91${m}` : m
  const messageText = [
    `Hello ${row.full_name},`,
    '',
    `Your Sevak Library membership has been approved.`,
    `Membership ID: ${row.membership_id || '—'}`,
    `Plan: ${row.membership_type} · ${formatINR(row.membership_fee)}`,
    row.start_date && row.end_date
      ? `Period: ${formatDate(row.start_date)} → ${formatDate(row.end_date)}`
      : '',
    '',
    'Thank you for becoming a part of our library.',
    'Sevak Library | Being Sevak Charitable Trust'
  ]
    .filter(Boolean)
    .join('\n')
  const encoded = encodeURIComponent(messageText)
  const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${encoded}` : ''
  const mailUrl = `mailto:${row.email}?subject=${encodeURIComponent(
    `Sevak Library Membership - ${row.membership_id || row.ref}`
  )}&body=${encoded}`

  const doReject = async () => {
    if (!reason.trim()) {
      toast('Please enter a reason for rejection.', 'error')
      return
    }
    setBusy('reject')
    const { error } = await supabase.rpc('reject_application', { p_id: row.id, p_reason: reason })
    if (error) toast(error.message, 'error')
    else {
      toast('Application rejected.')
      refresh()
      onClose()
    }
    setBusy('')
  }

  const doDelete = async () => {
    setBusy('delete')
    try {
      await deleteApplication(row)
      toast('Application deleted.')
      refresh()
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    }
    setBusy('')
  }

  const paymentInfo =
    !row.transaction_id && (d.amountReceived || d.paymentMode)
      ? [d.paymentMode, d.amountReceived].filter(Boolean).join(' · ')
      : ''

  const rows = [
    ['Full name', row.full_name],
    ['Email', row.email],
    ['Mobile', row.mobile],
    ['Guardian', d.guardianName],
    ['Date of birth', d.dateOfBirth && formatDate(d.dateOfBirth)],
    ['Gender', d.gender],
    ['Category', d.category],
    ['Degree', d.degree],
    ['Occupation', d.occupation],
    ['Qualification', d.educationalQualification],
    ['Address', d.currentAddress && [d.currentAddress, d.city, d.state, d.pinCode].filter(Boolean).join(', ')],
    ['Plan', row.membership_type],
    ['Fee', formatINR(row.membership_fee)],
    ['Start → End', row.start_date && row.end_date ? `${formatDate(row.start_date)} → ${formatDate(row.end_date)}` : '—'],
    ['Identity proof', row.identity_proof_type ? `${row.identity_proof_type}${row.identity_number ? ` · ${row.identity_number}` : ''}` : '—'],
    ['Payment ref', row.payment_ref],
    ...(paymentInfo ? [['Payment', paymentInfo]] : []),
    ['Transaction / UTR', row.transaction_id || '—'],
    ['Membership ID', row.membership_id || '—'],
    ['Signature', d.applicantSignature],
    ...(d.remarks ? [['Remarks', d.remarks]] : [])
  ].filter(([, v]) => v)

  const stepIdx = steps.indexOf(row.status)
  const showTimeline = row.status !== 'REJECTED'

  return (
    <div className="drawer-overlay" onClick={() => !busy && onClose()}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h3>{row.full_name}</h3>
            <span className="mono">{row.ref}</span>
            <span className={`admin-badge ${row.status}`}>{statusLabel(row.status)}</span>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          {showTimeline && (
            <div className="timeline">
              {steps.map((s, i) => (
                <div key={s} className={`tl-step ${i <= stepIdx ? 'done' : ''} ${i === stepIdx ? 'current' : ''}`}>
                  <span className="tl-dot">{stepIcon[s]}</span>
                  <span className="tl-label">{statusLabel(s)}</span>
                </div>
              ))}
            </div>
          )}
          {row.status === 'REJECTED' && row.reject_reason && (
            <div className="reject-box">
              <strong>Rejection reason:</strong> {row.reject_reason}
            </div>
          )}

          {editing ? (
            <div className="edit-form">
              <p className="edit-hint">End date and fee recalculate automatically when you change the plan or start date.</p>
              <div className="edit-grid">
                {EDIT_FIELDS.map((f) => (
                  <label key={f.id} className={`edit-field ${f.input === 'textarea' ? 'edit-wide' : ''}`}>
                    <span className="edit-label">{f.label}</span>
                    {f.input === 'select' ? (
                      <select value={editValues[f.id] || ''} onChange={(e) => handleEditChange(f.id, e.target.value)}>
                        <option value="">— Select —</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.input === 'textarea' ? (
                      <textarea value={editValues[f.id] || ''} onChange={(e) => handleEditChange(f.id, e.target.value)} rows={2} />
                    ) : (
                      <input
                        type={f.input}
                        value={editValues[f.id] || ''}
                        onChange={(e) => handleEditChange(f.id, e.target.value)}
                      />
                    )}
                    {editErrors[f.id] && <span className="edit-error">{editErrors[f.id]}</span>}
                  </label>
                ))}
                <label className="edit-field">
                  <span className="edit-label">Transaction / UTR</span>
                  <input
                    type="text"
                    value={editValues.transactionId || ''}
                    onChange={(e) => handleEditChange('transactionId', e.target.value)}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="detail-grid">
              {rows.map(([k, v]) => (
                <div key={k} className="detail-item">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </div>
          )}

          <h4 className="doc-head">Documents</h4>
          <div className="doc-grid">
            {[
              { key: 'passport', label: 'Passport photo', current: files.passport },
              { key: 'identity', label: 'Identity proof', current: files.identity }
            ].map(({ key, label, current }) => (
              <div key={key} className="doc-card">
                <span className="doc-label">{label}</span>
                {newPhotoPrev[key] ? (
                  <div className="doc-preview">
                    <img src={newPhotoPrev[key]} alt={label} />
                    <span className="doc-new-tag">New photo</span>
                  </div>
                ) : current ? (
                  <a href={current} target="_blank" rel="noreferrer">
                    <img src={current} alt={label} />
                    <span className="doc-open"><ExternalLink size={13} /> Open</span>
                  </a>
                ) : (
                  <p className="admin-empty">No file</p>
                )}
                {editing && (
                  <div className="doc-replace">
                    <label className="doc-replace-btn">
                      <ImagePlus size={13} /> Replace
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        hidden
                        onChange={(e) => onPhotoChange(key, e.target.files[0])}
                      />
                    </label>
                    {newPhotos[key] && (
                      <button type="button" className="doc-remove-btn" onClick={() => clearNewPhoto(key)}>
                        <X size={13} /> Remove
                      </button>
                    )}
                  </div>
                )}
                {newPhotoErr[key] && <p className="edit-error doc-err">{newPhotoErr[key]}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-actions">
          {editing ? (
            <>
              <button className="btn-act" onClick={cancelEdit} disabled={!!busy}>
                <X size={15} /> Cancel
              </button>
              <button className="btn-act approve" onClick={saveEdit} disabled={!!busy}>
                {busy === 'save' ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Save changes
              </button>
            </>
          ) : (
            <>
              <button className="btn-act" onClick={startEdit} disabled={!!busy}>
                <Pencil size={15} /> Edit details
              </button>
              {row.status === 'PAYMENT_SUBMITTED' && (
                <button className="btn-act verify" onClick={verify} disabled={!!busy}>
                  {busy === 'verify' ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Verify txn
                </button>
              )}
              {(row.status === 'VERIFIED' || row.status === 'PAYMENT_SUBMITTED') && (
                <button className="btn-act approve" onClick={approve} disabled={!!busy}>
                  {busy === 'approve' ? <Loader2 size={15} className="spin" /> : <BadgeCheck size={15} />} Approve & send email
                </button>
              )}
              {row.status === 'APPROVED' && (
                <>
                  <button className="btn-act pdf" onClick={printPdf} disabled={!!busy}>
                    {busy === 'pdf' ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} Registration PDF
                  </button>
                  <a className="btn-act whatsapp" href={waUrl} target="_blank" rel="noreferrer">
                    <MessageCircle size={15} /> WhatsApp
                  </a>
                  <a className="btn-act email" href={mailUrl}>
                    <Mail size={15} /> Email
                  </a>
                </>
              )}
              {row.status === 'SUBMITTED' && (
                <button className="btn-act remind" onClick={sendReminder} disabled={!!busy}>
                  {busy === 'reminder' ? <Loader2 size={15} className="spin" /> : <Mail size={15} />} Send payment reminder
                </button>
              )}
              {(row.status === 'SUBMITTED' || row.status === 'PAYMENT_SUBMITTED') && (
                <button className="btn-act reject" onClick={() => setConfirm('reject')} disabled={!!busy}>
                  <Ban size={15} /> Reject
                </button>
              )}
              <button className="btn-act danger" onClick={() => setConfirm('delete')} disabled={!!busy}>
                <Trash2 size={15} /> Delete
              </button>
            </>
          )}
        </div>

        {confirm && (
          <div className="confirm-bar">
            {confirm === 'reject' ? (
              <>
                <label className="confirm-label">Rejection reason</label>
                <textarea
                  className="confirm-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this application being rejected?"
                />
                <div className="confirm-btns">
                  <button className="btn-act" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn-act danger" onClick={doReject} disabled={busy === 'reject'}>
                    {busy === 'reject' ? <Loader2 size={15} className="spin" /> : <XCircle size={15} />} Reject
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="confirm-label">Delete this application? This removes its uploaded files and cannot be undone.</p>
                <div className="confirm-btns">
                  <button className="btn-act" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn-act danger" onClick={doDelete} disabled={busy === 'delete'}>
                    {busy === 'delete' ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />} Delete permanently
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
