import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const STEPS = ['Personal Details', 'Address', 'Education', 'Experience', 'Family', 'Profile Photo', 'Digital Signature', 'Review & Submit']
const STEP_SUBS = ['Tell us about yourself', 'Your permanent address', 'Your highest qualification', 'Previous work experience', 'Family members', 'Take a clear photo', 'Sign digitally', 'Verify and submit']

const INITIAL = {
  personal: { name: '', email: '', phone: '', alternate_phone: '', dob: '', gender: '', father_husband_name: '', marital_status: '', pan_number: '', aadhar_number: '' },
  address: { address: '', city: '', state: '', pincode: '', correspondence: { address: '', city: '', state: '', pincode: '' }, useCorrespondence: false },
  education: { degree: '', institution: '', university: '', from_year: '', to_year: '', year_of_passing: '', percentage: '' },
  experience: { organization_name: '', role: '', from_year: '', to_year: '' },
  family: [{ name: '', relationship: '', occupation: '', phone: '', dob: '' }, { name: '', relationship: '', occupation: '', phone: '', dob: '' }, { name: '', relationship: '', occupation: '', phone: '', dob: '' }],
  bank: { bank_name: '', account_holder_name: '', ifsc_code: '', account_number: '' },
}

const DOC_TYPES = [
  { key: 'aadhar_front', label: 'Aadhaar Card (Front)' },
  { key: 'aadhar_back', label: 'Aadhaar Card (Back)' },
  { key: 'pan_card', label: 'PAN Card' },
  { key: 'bank_proof', label: 'Bank Proof' },
  { key: 'light_bill', label: 'Light Bill' },
]

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => { const idx = reader.result.indexOf('base64,'); resolve({ base64: reader.result.slice(idx + 7), mime: file.type || 'image/jpeg' }) }
  reader.onerror = reject
  reader.readAsDataURL(file)
})

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(INITIAL)
  const [loading, setLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [error, setError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [docs, setDocs] = useState({})
  const [policies, setPolicies] = useState([])
  const [accepted, setAccepted] = useState([])
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [capturedDocs, setCapturedDocs] = useState({})
  const [capturedSignature, setCapturedSignature] = useState(null)
  const [cameraMode, setCameraMode] = useState(null)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraCaptureData, setCameraCaptureData] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const [showPhotoPreview, setShowPhotoPreview] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem('ucs_token')
    if (token) {
      api.policies().then(d => setPolicies(Array.isArray(d) ? d : d?.policies || [])).catch(() => {})
      api.onboardingStatus().then(() => {
        document.getElementById('login-screen').style.display = 'none'
        document.getElementById('wizard-screen').classList.remove('hidden')
        try {
          const profile = localStorage.getItem('ucs_worker')
          if (profile) {
            const u = JSON.parse(profile)
            if (u.photo_url && !capturedPhoto) setCapturedPhoto(u.photo_url)
          }
        } catch {}
        try {
          api.myProfile().then(applyProfile).catch(() => {})
        } catch {}
      }).catch(() => {
        localStorage.removeItem('ucs_token')
        localStorage.removeItem('ucs_worker')
      })
    }
    const saved = localStorage.getItem('ucs_onboarding')
    if (saved) {
      try {
        const r = JSON.parse(saved)
        if (r.personal) setForm(f => ({ ...f, personal: r.personal }))
        if (r.address) setForm(f => ({ ...f, address: r.address }))
        if (r.education) setForm(f => ({ ...f, education: r.education }))
        if (r.experience) setForm(f => ({ ...f, experience: r.experience }))
        if (r.family) setForm(f => ({ ...f, family: r.family }))
        if (r.bank) setForm(f => ({ ...f, bank: r.bank }))
        if (r.capturedPhoto) setCapturedPhoto(r.capturedPhoto)
        if (r.capturedDocs) setCapturedDocs(r.capturedDocs)
        if (r.capturedSignature) setCapturedSignature(r.capturedSignature)
        if (typeof r.step === 'number') setStep(r.step)
      } catch {}
    }
  }, [])

  const saveState = useCallback(() => {
    try {
      localStorage.setItem('ucs_onboarding', JSON.stringify({
        step, personal: form.personal, address: form.address, education: form.education,
        experience: form.experience, family: form.family, bank: form.bank,
        capturedPhoto, capturedDocs, capturedSignature, policies,
      }))
    } catch {}
  }, [step, form, capturedPhoto, capturedDocs, capturedSignature, policies])

  useEffect(() => { saveState() }, [step, form, capturedPhoto, capturedDocs, capturedSignature])

  const update = (path, val) => {
    const keys = path.split('.')
    setForm(f => {
      const copy = JSON.parse(JSON.stringify(f))
      let obj = copy
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
      obj[keys[keys.length - 1]] = val
      return copy
    })
  }

  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const showToast = (msg, type = 'success') => {
    const t = document.createElement('div')
    t.className = `toast toast-${type}`
    t.textContent = msg
    document.getElementById('toast-container')?.appendChild(t)
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300) }, 3000)
  }

  const nextStep = () => {
    if (step === 0) {
      if (!form.personal.name) return showToast('Full Name is required', 'error')
      if (!form.personal.email) return showToast('Email is required', 'error')
      if (!form.personal.phone || form.personal.phone.replace(/\D/g, '').length < 10) return showToast('Valid phone required', 'error')
      if (form.personal.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.personal.pan_number)) return showToast('Invalid PAN format (e.g. ABCDE1234F)', 'error')
      if (form.personal.aadhar_number && !/^\d{12}$/.test(form.personal.aadhar_number)) return showToast('Invalid Aadhaar number (12 digits required)', 'error')
    }
    if (step === 4) {
      const valid = form.family.filter(f => f.name.trim())
      if (valid.length < 3) return showToast('Please add at least 3 family members', 'error')
      for (const m of form.family) {
        if (m.phone && m.phone.replace(/\D/g, '').length < 10) return showToast('Valid phone required for ' + (m.name || 'family member'), 'error')
      }
    }
    setStep(s => s + 1)
  }

  const applyProfile = (p) => {
    if (!p) return
    update('personal.name', p.name)
    update('personal.email', p.email)
    update('personal.phone', p.phone)
    update('personal.alternate_phone', p.alternate_phone)
    update('personal.dob', p.dob)
    update('personal.gender', p.gender)
    update('personal.father_husband_name', p.father_husband_name)
    update('personal.marital_status', p.marital_status)
    update('personal.pan_number', p.pan_number)
    update('personal.aadhar_number', p.aadhar_number)
    update('address.address', p.address)
    update('address.city', p.city)
    update('address.state', p.state)
    update('address.pincode', p.pincode)
    update('bank.bank_name', p.bank_name)
    update('bank.account_holder_name', p.account_holder_name)
    update('bank.ifsc_code', p.ifsc_code)
    update('bank.account_number', p.account_number)
    if (p.photo_url) setCapturedPhoto(p.photo_url)
    if (p.education_details?.[0]) {
      const e = p.education_details[0]
      update('education.degree', e.degree)
      update('education.institution', e.institution)
      update('education.university', e.university)
      update('education.from_year', e.from_year)
      update('education.to_year', e.to_year)
      update('education.year_of_passing', e.year_of_passing)
      update('education.percentage', e.percentage)
    }
    if (p.previous_organizations?.[0]) {
      const e = p.previous_organizations[0]
      update('experience.organization_name', e.organization_name)
      update('experience.role', e.role)
      update('experience.from_year', e.from_year)
      update('experience.to_year', e.to_year)
    }
    if (p.family_details?.length) {
      update('family', p.family_details.map(f => ({ name: f.name || '', relationship: f.relationship || '', occupation: f.occupation || '', phone: f.phone || '', dob: f.dob || '' })))
    }
  }

  const doLogin = async () => {
    const id = document.getElementById('login-id')?.value?.trim()
    const pw = document.getElementById('login-pass')?.value
    if (!id || !pw) { setError('Please fill in all fields'); return }
    setLoginLoading(true)
    setError('')
    try {
      const d = await api.login(id, pw)
      localStorage.setItem('ucs_token', d.token)
      localStorage.setItem('ucs_worker', JSON.stringify(d.user))
      api.policies().then(p => setPolicies(Array.isArray(p) ? p : p?.policies || [])).catch(() => {})
      try {
        applyProfile(await api.myProfile())
      } catch {}
      document.getElementById('login-screen').style.display = 'none'
      document.getElementById('wizard-screen').classList.remove('hidden')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const doLogout = () => {
    localStorage.removeItem('ucs_token')
    localStorage.removeItem('ucs_worker')
    setForm(INITIAL)
    setCapturedPhoto(null)
    setCapturedDocs({})
    setCapturedSignature(null)
    setStep(0)
    setSubmitted(false)
    setError('')
    document.getElementById('wizard-screen').classList.add('hidden')
    document.getElementById('login-screen').style.display = ''
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      if (capturedPhoto && capturedPhoto.startsWith('data:')) {
        await api.uploadPhoto(capturedPhoto.split(',')[1], 'image/jpeg')
      }
      for (const d of DOC_TYPES) {
        if (docs[d.key]) {
          const { base64, mime } = await readAsBase64(docs[d.key])
          await api.uploadDocument(d.key, base64, mime)
        }
      }
      for (const [t, d] of Object.entries(capturedDocs)) {
        if (d.startsWith('data:')) await api.uploadDocument(t, d.split(',')[1], 'image/jpeg')
      }
      if (capturedSignature && capturedSignature.startsWith('data:')) {
        await api.uploadSignature(capturedSignature.split(',')[1], 'image/png')
      }
      const pd = {
        name: form.personal.name, email: form.personal.email, phone: form.personal.phone,
        ...(form.personal.alternate_phone && { alternate_phone: form.personal.alternate_phone }),
        ...(form.personal.dob && { dob: form.personal.dob }),
        ...(form.personal.gender && { gender: form.personal.gender }),
        ...(form.personal.father_husband_name && { father_husband_name: form.personal.father_husband_name }),
        ...(form.personal.marital_status && { marital_status: form.personal.marital_status }),
        ...(form.personal.pan_number && { pan_number: form.personal.pan_number }),
        ...(form.personal.aadhar_number && { aadhar_number: form.personal.aadhar_number }),
        ...(form.address.address && { address: form.address.address }),
        ...(form.address.city && { city: form.address.city }),
        ...(form.address.state && { state: form.address.state }),
        ...(form.address.pincode && { pincode: form.address.pincode }),
        ...(form.bank.bank_name && { bank_name: form.bank.bank_name }),
        ...(form.bank.account_holder_name && { account_holder_name: form.bank.account_holder_name }),
        ...(form.bank.ifsc_code && { ifsc_code: form.bank.ifsc_code }),
        ...(form.bank.account_number && { account_number: form.bank.account_number }),
      }
      if (form.address.useCorrespondence && form.address.correspondence.address) {
        pd.correspondence = { address: form.address.correspondence.address, city: form.address.correspondence.city, state: form.address.correspondence.state, pincode: form.address.correspondence.pincode }
      }
      const cleanArr = a => a.filter(x => Object.values(x).some(v => v))
      const objToArr = o => Object.values(o).some(v => v) ? [o] : undefined
      await api.submitOnboarding({
        personal_details: pd,
        education: objToArr(form.education),
        family: cleanArr(form.family).length ? cleanArr(form.family) : undefined,
        previous_organizations: objToArr(form.experience),
      })
      setSubmitted(true)
    } catch (err) { showToast('Failed: ' + err.message, 'error') } finally { setLoading(false) }
  }

  const openCamera = async (mode) => {
    setCameraMode(mode)
    setCameraCaptureData(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      setCameraStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.classList.remove('hidden')
      }
      setShowCamera(true)
    } catch { showToast('Camera permission denied', 'error') }
  }

  const captureFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    setCameraCaptureData(canvas.toDataURL('image/jpeg', 0.85))
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); setCameraStream(null) }
    if (video) video.classList.add('hidden')
  }

  const confirmCapture = () => {
    if (!cameraCaptureData) return
    if (cameraMode === 'photo') setCapturedPhoto(cameraCaptureData)
    else if (cameraMode?.startsWith('doc_')) setCapturedDocs(prev => ({ ...prev, [cameraMode.replace('doc_', '')]: cameraCaptureData }))
    setShowCamera(false)
    saveState()
    showToast('Photo captured!')
  }

  const retakeCamera = () => { setCameraCaptureData(null); if (videoRef.current) videoRef.current.classList.remove('hidden') }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const hasContent = imageData.data.some(ch => ch !== 0)
    if (!hasContent) return showToast('Please draw your signature first', 'error')
    setCapturedSignature(canvas.toDataURL('image/png'))
    setShowCamera(false)
    showToast('Signature saved!')
  }

  const clearSignature = () => { setCapturedSignature(null); setShowCamera(false) }

  const fi = (label, value, path, type = 'text', placeholder = '', required = false) => (
    <div className="mb-4">
      <label className="form-label block text-sm font-medium text-gray-700 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={value || ''} placeholder={placeholder} maxLength={type === 'tel' ? 15 : undefined}
        onChange={e => update(path, e.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white py-2.5 px-3.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
    </div>
  )

  const fs = (label, value, path, options, required = false) => (
    <div className="mb-4">
      <label className="form-label block text-sm font-medium text-gray-700 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <select value={value || ''} onChange={e => update(path, e.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white py-2.5 px-3.5 text-sm text-gray-900 transition-colors">
        <option value="">Select</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  const card = (children) => (
    <div className="step-card bg-white rounded-2xl border border-gray-200 p-5 mb-4 anim">{children}</div>
  )

  const sec = (t) => (
    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-1">{t}</div>
  )

  const renderStep = () => {
    saveState()
    const set = (path, val) => update(path, val)

    switch (step) {
      case 0: return card(
        <div>
          <div className="field-grid">
            <div className="full">{fi('Full Name', form.personal.name, 'personal.name', 'text', 'Your full name', true)}</div>
            <div className="full">{fi('Email', form.personal.email, 'personal.email', 'email', 'you@example.com', true)}</div>
            {fi('Phone', form.personal.phone, 'personal.phone', 'tel', 'Mobile number', true)}
            {fi('Alt Phone', form.personal.alternate_phone, 'personal.alternate_phone', 'tel', 'Optional')}
            {fi('Date of Birth', form.personal.dob, 'personal.dob', 'date')}
            {fs('Gender', form.personal.gender, 'personal.gender', ['Male', 'Female', 'Other'])}
            {fi("Father / Husband", form.personal.father_husband_name, 'personal.father_husband_name', 'text', "Father's or husband's name")}
            {fs('Marital Status', form.personal.marital_status, 'personal.marital_status', ['Single', 'Married', 'Divorced', 'Widowed'])}
            {fi('PAN', form.personal.pan_number, 'personal.pan_number', 'text', 'ABCDE1234F', false, { max: 10 })}
            {fi('Aadhaar', form.personal.aadhar_number, 'personal.aadhar_number', 'text', '12-digit Aadhaar', false, { max: 12 })}
          </div>
          {sec('Bank Account')}
          <div className="field-grid">
            <div className="full">{fi('Bank Name', form.bank.bank_name, 'bank.bank_name', 'text', 'e.g. State Bank of India')}</div>
            <div className="full">{fi('Account Holder', form.bank.account_holder_name, 'bank.account_holder_name', 'text', 'Name as per bank records')}</div>
            {fi('IFSC', form.bank.ifsc_code, 'bank.ifsc_code', 'text', 'e.g. SBIN0001234')}
            {fi('Account No', form.bank.account_number, 'bank.account_number', 'text', 'Account number')}
          </div>
        </div>
      )
      case 1: return (
        <div>
          {card(
            <div>
              {sec('Permanent Address')}
              <div className="field-grid">
                <div className="full">{fi('Address', form.address.address, 'address.address', 'text', 'Street address')}</div>
                {fi('City', form.address.city, 'address.city', 'text', 'City')}
                {fi('State', form.address.state, 'address.state', 'text', 'State')}
                {fi('Pincode', form.address.pincode, 'address.pincode', 'text', '6-digit pincode', false, { max: 6 })}
              </div>
            </div>
          )}
          {card(
            <div>
              <div className="flex items-center justify-between cursor-pointer py-1" onClick={() => update('address.useCorrespondence', !form.address.useCorrespondence)}>
                <span className="text-sm font-medium text-gray-700">Correspondence Address?</span>
                <div className={`w-11 h-6 rounded-full ${form.address.useCorrespondence ? 'bg-blue-500' : 'bg-gray-300'} relative transition-colors pointer-events-none`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${form.address.useCorrespondence ? 'translate-x-[22px]' : 'left-0.5'}`}></div>
                </div>
              </div>
              {form.address.useCorrespondence && sec('Correspondence Address')}
              {form.address.useCorrespondence && (
                <div className="field-grid">
                  <div className="full">{fi('Address', form.address.correspondence.address, 'address.correspondence.address', 'text', 'Street address')}</div>
                  {fi('City', form.address.correspondence.city, 'address.correspondence.city', 'text', 'City')}
                  {fi('State', form.address.correspondence.state, 'address.correspondence.state', 'text', 'State')}
                  {fi('Pincode', form.address.correspondence.pincode, 'address.correspondence.pincode', 'text', '6-digit pincode', false, { max: 6 })}
                </div>
              )}
            </div>
          )}
        </div>
      )
      case 2: return card(
        <div>
          <div className="field-grid">
            <div className="full">{fi('Degree / Qualification', form.education.degree, 'education.degree', 'text', 'e.g. 10th, BSc, MBA', true)}</div>
            <div className="full">{fi('Institution', form.education.institution, 'education.institution', 'text', 'School or college name', true)}</div>
            {fi('University / Board', form.education.university, 'education.university', 'text', 'University')}
            {fi('Percentage', form.education.percentage, 'education.percentage', 'text', '85% or A+')}
            {fi('From Year', form.education.from_year, 'education.from_year', 'text', '2018')}
            {fi('To Year', form.education.to_year, 'education.to_year', 'text', '2022')}
            {fi('Passing Year', form.education.year_of_passing, 'education.year_of_passing', 'text', '2022')}
          </div>
        </div>
      )
      case 3: return card(
        <div>
          <div className="field-grid">
            <div className="full">{fi('Organization Name', form.experience.organization_name, 'experience.organization_name', 'text', 'Company name')}</div>
            {fi('Role / Designation', form.experience.role, 'experience.role', 'text', 'Your role')}
            {fi('From Year', form.experience.from_year, 'experience.from_year', 'text', '2020')}
            {fi('To Year', form.experience.to_year, 'experience.to_year', 'text', '2023')}
          </div>
        </div>
      )
      case 4: return (
        <div>
          {card(<div className="text-sm font-semibold text-gray-800 mb-3">Family Members</div>)}
          {form.family.map((item, i) => card(
            <div key={i}>
              <div className="flex justify-end mb-2" style={{ display: form.family.length > 3 ? 'flex' : 'none' }}>
                <button className="text-xs text-red-400 hover:text-red-500 bg-transparent border-none cursor-pointer" onClick={() => { const f = [...form.family]; f.splice(i, 1); update('family', f) }}>Remove</button>
              </div>
              <div className="field-grid">
                <div className="full">{fi('Name', item.name, `family.${i}.name`, 'text', 'Full name', true)}</div>
                {fi('Relationship', item.relationship, `family.${i}.relationship`, 'text', 'Father, Mother, Spouse')}
                {fi('Occupation', item.occupation, `family.${i}.occupation`, 'text', 'Occupation')}
                {fi('Phone', item.phone, `family.${i}.phone`, 'tel', 'Phone')}
              </div>
            </div>
          ))}
          {form.family.length < 10 && (
            <button className="text-sm font-medium text-blue-500 hover:text-blue-600 bg-transparent border-none cursor-pointer w-full text-center py-2" onClick={() => { const f = [...form.family, { name: '', relationship: '', occupation: '', phone: '', dob: '' }]; update('family', f) }}>+ Add Family Member</button>
          )}
        </div>
      )
      case 5: return card(
        <div>
          {capturedPhoto ? (
            <div className="text-center">
              <div className="w-36 h-36 mx-auto rounded-full overflow-hidden border-2 border-blue-400 mb-4 cursor-pointer" onClick={() => setShowPhotoPreview(true)} title="Tap to view full size">
                <img src={capturedPhoto} className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-3 justify-center">
                <button className="rounded-lg border border-gray-300 bg-white text-gray-700 text-sm px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => openCamera('photo')}>Retake</button>
                <button className="rounded-lg border border-red-200 bg-red-50 text-red-500 text-sm px-4 py-2 hover:bg-red-100 cursor-pointer transition-colors" onClick={() => { setCapturedPhoto(null); saveState() }}>Remove</button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/></svg>
              </div>
              <p className="text-sm text-gray-500 mb-4">Take a clear photo for your profile</p>
              <button className="rounded-xl bg-blue-500 text-white font-medium text-sm px-6 py-2.5 hover:bg-blue-600 cursor-pointer transition-colors inline-flex items-center gap-2" onClick={() => openCamera('photo')}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/></svg>
                Open Camera
              </button>
            </div>
          )}
          <div className="mt-4">
            <label className="block text-xs text-gray-400 mb-1">Or upload from file</label>
            <input type="file" accept="image/*" onChange={async e => { const f = e.target.files[0]; if (f) { const { base64, mime } = await readAsBase64(f); setCapturedPhoto(`data:${mime};base64,${base64}`) } }} className="w-full text-sm" />
          </div>
        </div>
      )
      case 6: return card(
        <div>
          {capturedSignature ? (
            <div className="text-center">
              <div className="max-w-xs mx-auto mb-4"><img src={capturedSignature} className="w-full border border-gray-300 rounded-xl" style={{ maxHeight: 120 }} /></div>
              <p className="text-sm text-green-600 font-medium mb-4">Signature captured</p>
              <div className="flex gap-3 justify-center">
                <button className="rounded-lg border border-gray-300 bg-white text-gray-700 text-sm px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors" onClick={clearSignature}>Clear & Redraw</button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-4">Draw your signature below using your mouse or finger.</p>
              <canvas ref={canvasRef} width="500" height="150" style={{ width: '100%', maxWidth: 500, height: 150, border: '2px dashed #d1d5db', borderRadius: 12, cursor: 'crosshair', background: '#fafafa', touchAction: 'none', display: 'block', margin: '0 auto' }}
                onMouseDown={e => { const c = canvasRef.current; const ctx = c.getContext('2d'); const r = c.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); let drawing = true; const move = (ev) => { if (!drawing) return; const x = ev.touches ? ev.touches[0].clientX - r.left : ev.clientX - r.left; const y = ev.touches ? ev.touches[0].clientY - r.top : ev.clientY - r.top; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y) }; const up = () => { drawing = false }; c.onmousemove = move; c.onmouseup = up; c.onmouseleave = up; }}
                onTouchStart={e => { e.preventDefault(); const c = canvasRef.current; const ctx = c.getContext('2d'); const r = c.getBoundingClientRect(); const t = e.touches[0]; ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top); let drawing = true; const move = (ev) => { if (!drawing) return; ev.preventDefault(); const x = ev.touches[0].clientX - r.left; const y = ev.touches[0].clientY - r.top; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y) }; const up = () => { drawing = false }; c.ontouchmove = move; c.ontouchend = up; }}
              />
              <div className="flex gap-3 justify-center mt-4">
                <button className="rounded-lg bg-blue-500 text-white font-medium text-sm px-6 py-2.5 hover:bg-blue-600 cursor-pointer transition-colors" onClick={saveSignature}>Save Signature</button>
              </div>
            </div>
          )}
        </div>
      )
      case 7: {
        const row = (k, v) => (
          <div className="flex justify-between items-center py-2.5 px-3 border-b border-gray-100 last:border-b-0">
            <span className="text-sm text-gray-500">{k}</span>
            <span className={`text-sm font-semibold text-gray-900 text-right max-w-[55%] break-words ${!v ? 'text-gray-400 font-normal italic' : ''}`}>{v || 'Not provided'}</span>
          </div>
        )
        const rsec = (t, rows) => (
          <div className="mb-5">
            <div className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2 flex items-center gap-2"><div className="w-1 h-3 rounded-full bg-blue-500"></div>{t}</div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">{rows}</div>
          </div>
        )
        const familyMembers = form.family.filter(f => f.name)
        return card(
          <div>
            <p className="text-sm text-gray-500 mb-5">Please verify all information before submitting</p>
            {rsec('Personal',
              <Fragment>
                {row('Name', form.personal.name)}{row('Email', form.personal.email)}{row('Phone', form.personal.phone)}{row('Alt Phone', form.personal.alternate_phone)}{row('DOB', form.personal.dob)}{row('Gender', form.personal.gender)}{row('Father/Husband', form.personal.father_husband_name)}{row('Marital Status', form.personal.marital_status)}{row('PAN', form.personal.pan_number)}{row('Aadhaar', form.personal.aadhar_number)}
              </Fragment>
            )}
            {rsec('Address',
              <Fragment>
                {row('Address', form.address.address)}{row('City', form.address.city)}{row('State', form.address.state)}{row('Pincode', form.address.pincode)}
                {form.address.useCorrespondence && row('Correspondence', `${form.address.correspondence.address}, ${form.address.correspondence.city}`)}
              </Fragment>
            )}
            {rsec('Education', row('Highest', form.education.degree ? `${form.education.degree} - ${form.education.institution}` : null))}
            {rsec('Experience', row('Last Org', form.experience.organization_name ? `${form.experience.organization_name}${form.experience.role ? ` (${form.experience.role})` : ''}` : null))}
            {rsec('Family',
              familyMembers.length
                ? <Fragment>{familyMembers.map((f, i) => <Fragment key={i}>{row(`# ${i + 1}`, f.name + (f.relationship ? ` (${f.relationship})` : ''))}</Fragment>)}</Fragment>
                : <div className="text-sm text-gray-400 text-center py-3">None</div>
            )}
            {rsec('Photo',
              row('Photo', capturedPhoto ? 'Captured' : null)
            )}
            {rsec('Bank',
              <Fragment>
                {row('Bank', form.bank.bank_name)}{row('Holder', form.bank.account_holder_name)}{row('IFSC', form.bank.ifsc_code)}{row('Account No', form.bank.account_number)}
              </Fragment>
            )}
            {rsec('Signature', row('Digital Signature', capturedSignature ? 'Signed ✔' : null))}
          </div>
        )
      }
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div id="toast-container"></div>

      {/* LOGIN */}
      <div id="login-screen" className="min-h-screen flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-500 text-white flex items-center justify-center text-xl font-bold shadow-sm">U</div>
            <h1 className="text-xl font-bold text-gray-900">Welcome</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to start your onboarding</p>
          </div>
          {error && <div id="login-error" className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Login ID / Email</label><input id="login-id" type="text" placeholder="Enter your login ID or email" autoComplete="username" className="w-full rounded-xl border border-gray-300 bg-white py-2.5 px-3.5 text-sm text-gray-900 placeholder-gray-400 transition-colors" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label><input id="login-pass" type="password" placeholder="Enter your password" autoComplete="current-password" className="w-full rounded-xl border border-gray-300 bg-white py-2.5 px-3.5 text-sm text-gray-900 placeholder-gray-400 transition-colors" /></div>
            <button onClick={doLogin} id="login-btn" disabled={loginLoading} className="w-full rounded-xl bg-blue-500 text-white font-semibold text-sm py-2.5 hover:bg-blue-600 transition-colors disabled:opacity-50 min-h-[44px]">
              <span id="login-btn-text">{loginLoading ? 'Signing in...' : 'Sign In'}</span>
              <svg id="login-btn-spinner" className={`w-4 h-4 animate-spin inline ${loginLoading ? '' : 'hidden'}`} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* WIZARD */}
      <div id="wizard-screen" className="hidden min-h-screen py-6 px-4 max-w-lg mx-auto wizard-wide">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              {capturedPhoto && <img src={capturedPhoto} className="w-7 h-7 rounded-full object-cover border-2 border-blue-400 cursor-pointer" onClick={() => setStep(5)} title="Edit photo" />}
            </div>
            <button onClick={doLogout} title="Logout" className="w-8 h-8 rounded-full border border-gray-200 bg-transparent cursor-pointer flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
            </button>
          </div>
          {submitted ? (
            <div className="flex items-center justify-center gap-3 mb-4">
              {STEPS.map((_, i) => (
                <Fragment key={i}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-blue-500 text-white">✓</div>
                  {i < STEPS.length - 1 && <div className="w-10 h-0.5 rounded bg-blue-500"></div>}
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 mb-4">
              {STEPS.map((_, i) => (
                <Fragment key={i}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors flex-shrink-0 cursor-pointer border-none ${i <= step ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}`} onClick={() => { if (i <= step) setStep(i) }}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  {i < STEPS.length - 1 && <div className={`w-10 h-0.5 rounded transition-colors ${i < step ? 'bg-blue-500' : 'bg-gray-200'}`}></div>}
                </Fragment>
              ))}
            </div>
          )}
          {!submitted && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 text-center">{STEPS[step]}</h2>
              <p className="text-sm text-gray-500 text-center mt-0.5">{STEP_SUBS[step]}</p>
            </div>
          )}
        </div>

        {submitted ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">All Done!</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">Your onboarding has been submitted. We'll review and get back to you soon.</p>
          </div>
        ) : (
          <div id="step-content" className="anim">{renderStep()}</div>
        )}

        {!submitted && step < 7 && (
          <button onClick={nextStep}
            className="w-full rounded-xl bg-blue-500 text-white font-semibold text-sm py-2.5 hover:bg-blue-600 transition-colors disabled:opacity-50 min-h-[44px]">
            Continue
          </button>
        )}
        {!submitted && step === 7 && (
          <button onClick={handleSubmit} disabled={loading}
            className="w-full rounded-xl bg-emerald-500 text-white font-semibold text-sm py-2.5 hover:bg-emerald-600 transition-colors disabled:opacity-50 min-h-[44px]">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75"/></svg>
                Submitting...
              </span>
            ) : 'Submit'}
          </button>
        )}
        {submitted && (
          <button onClick={doLogout} className="w-full rounded-xl bg-blue-500 text-white font-semibold text-sm py-2.5 hover:bg-blue-600 transition-colors min-h-[44px]">
            Finish
          </button>
        )}
      </div>

      {/* Camera Modal */}
      <div id="camera-modal" className={`fixed inset-0 z-[200] bg-black ${showCamera ? 'flex' : 'hidden'} flex-col`}>
        <div className="flex items-center justify-between p-4">
          <span className="text-white font-semibold text-sm">{cameraMode === 'photo' ? 'Profile Photo' : 'Document'}</span>
          <button onClick={() => { setShowCamera(false); if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); setCameraStream(null) } }} className="w-9 h-9 rounded-full bg-white/10 border-none text-white cursor-pointer flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <video ref={videoRef} autoPlay playsInline className={`w-full max-h-[50vh] rounded-2xl object-cover ${cameraCaptureData ? 'hidden' : ''}`} />
          {cameraCaptureData && <img src={cameraCaptureData} className="w-full max-h-[50vh] rounded-2xl object-contain" />}
        </div>
        <div className="flex gap-4 justify-center p-4">
          {cameraCaptureData ? (
            <>
              <button onClick={confirmCapture} className="rounded-xl bg-emerald-500 text-white font-medium text-sm px-8 py-2.5 hover:bg-emerald-600 cursor-pointer transition-colors">Use</button>
              <button onClick={retakeCamera} className="rounded-xl border border-white/30 text-white font-medium text-sm px-8 py-2.5 hover:bg-white/10 cursor-pointer transition-colors">Retake</button>
            </>
          ) : (
            <button onClick={captureFrame} className="w-16 h-16 rounded-full border-4 border-white bg-transparent cursor-pointer relative hover:scale-95 transition-transform" style={{ minWidth: 64 }}>
              <span className="absolute inset-[5px] rounded-full bg-white"></span>
            </button>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Photo Full-Screen Preview */}
      <div className={`fixed inset-0 z-[200] bg-black ${showPhotoPreview ? 'flex' : 'hidden'} flex-col`}>
        <div className="flex items-center justify-between p-4">
          <span className="text-white font-semibold text-sm">Profile Photo</span>
          <button onClick={() => setShowPhotoPreview(false)} className="w-9 h-9 rounded-full bg-white/10 border-none text-white cursor-pointer flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <img src={capturedPhoto} className="max-w-full max-h-[70vh] rounded-2xl object-contain" />
        </div>
        <div className="flex gap-4 justify-center p-4">
          <button onClick={() => { setShowPhotoPreview(false); openCamera('photo') }} className="rounded-xl border border-white/30 text-white font-medium text-sm px-8 py-2.5 hover:bg-white/10 cursor-pointer transition-colors">Retake</button>
          <button onClick={() => setShowPhotoPreview(false)} className="rounded-xl bg-emerald-500 text-white font-medium text-sm px-8 py-2.5 hover:bg-emerald-600 cursor-pointer transition-colors">Close</button>
        </div>
      </div>
    </div>
  )
}