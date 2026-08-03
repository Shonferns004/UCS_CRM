import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const GENDERS = ['Male', 'Female', 'Other']
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed']

const FIELDS = [
  'name', 'email', 'phone', 'alternate_phone', 'father_husband_name',
  'gender', 'marital_status', 'dob',
  'address', 'permanent_address', 'city', 'state', 'pincode',
  'bank_name', 'account_holder_name', 'ifsc_code', 'account_number',
]

const LABELS = {
  name: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  alternate_phone: 'Alt. Phone',
  father_husband_name: 'Father / Husband Name',
  gender: 'Gender',
  marital_status: 'Marital Status',
  dob: 'Date of Birth',
  address: 'Current Address',
  permanent_address: 'Permanent Address',
  city: 'City',
  state: 'State',
  pincode: 'Pincode',
  bank_name: 'Bank Name',
  account_holder_name: 'Account Holder Name',
  ifsc_code: 'IFSC Code',
  account_number: 'Account Number',
}

export default function EditProfile() {
  const navigate = useNavigate()
  const [original, setOriginal] = useState({})
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.myProfile().then(d => {
      const w = d?.worker || d
      setOriginal(w || {})
      const values = {}
      FIELDS.forEach(f => { values[f] = w?.[f] ?? w?.[f.replace('_', '')] ?? '' })
      if (!values.phone) values.phone = w?.phone_number || ''
      setForm(values)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const computeChanges = () => {
    const changes = {}
    FIELDS.forEach(f => {
      const current = String(form[f] ?? '').trim()
      const orig = String(original[f] ?? '').trim()
      if (current !== orig) changes[f] = form[f] ?? ''
    })
    return changes
  }

  const changes = computeChanges()
  const hasChanges = Object.keys(changes).length > 0

  const handleSubmit = async () => {
    setError('')
    if (!form.name || !String(form.name).trim()) { setError('Name is required'); return }
    if (String(form.phone || '').length < 10) { setError('Enter a valid phone number'); return }
    if (!hasChanges) { setError('No changes to submit'); return }
    setSaving(true)
    try {
      await api.submitProfileUpdateRequest(changes)
      navigate('/profile', { state: { refresh: true } })
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  const input = (key, { type = 'text', maxLength } = {}) => (
    <div key={key}>
      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">{LABELS[key]}</label>
      <input type={type} maxLength={maxLength} value={form[key] || ''} onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )

  const select = (key, options) => (
    <div key={key}>
      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">{LABELS[key]}</label>
      <select value={form[key] || ''} onChange={e => set(key, e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-none focus:border-blue-500">
        <option value="">Select</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  const section = (title) => (
    <div key={title} className="text-[13px] font-bold text-[var(--primary)] uppercase tracking-wide pt-2">{title}</div>
  )

  return (
    <div className="app-container animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-bold text-[var(--primary)]">Edit Profile</h2>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[var(--border)] space-y-3">
          {error && <div className="p-3 rounded-lg bg-[var(--red-bg)] text-[var(--red)] text-xs">{error}</div>}
          {hasChanges && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              {Object.keys(changes).length} field{Object.keys(changes).length > 1 ? 's' : ''} changed. Changes will be sent to HR for review before being applied.
            </div>
          )}

          {section('Basic Information')}
          {input('name')}
          {input('email', { type: 'email' })}
          <div className="grid grid-cols-2 gap-3">
            {input('phone')}
            {input('alternate_phone')}
          </div>
          {input('father_husband_name')}

          {section('Personal Info')}
          <div className="grid grid-cols-2 gap-3">
            {select('gender', GENDERS)}
            {input('dob', { type: 'date' })}
          </div>
          {select('marital_status', MARITAL_STATUSES)}

          {section('Address')}
          {input('address')}
          <div className="grid grid-cols-2 gap-3">
            {input('city')}
            {input('state')}
          </div>
          {input('pincode', { maxLength: 6 })}
          {input('permanent_address')}

          {section('Bank Account Details')}
          <div className="text-xs text-[var(--ink-soft)] -mt-1">These details are used for salary disbursement</div>
          {input('bank_name')}
          {input('account_holder_name')}
          <div className="grid grid-cols-2 gap-3">
            {input('ifsc_code')}
            {input('account_number')}
          </div>

          <button onClick={handleSubmit} disabled={saving}
            className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50 mt-2">
            {saving ? 'Submitting...' : 'Submit for Review'}
          </button>
          <p className="text-[11px] text-center text-[var(--ink-muted)]">Changes are reviewed by HR before they appear on your profile.</p>
        </div>
      )}
    </div>
  )
}
