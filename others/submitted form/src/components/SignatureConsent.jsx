import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { parseDocumentsValue, serializeSelection, DOC_OPTIONS, OTHER_DOC } from '../documents'

const POLICY_TEXT = 'I have read, understood and agree to abide by the Volunteer Guidelines and Code of Conduct of Being Sevak Charitable Trust. I accept the terms of my volunteer engagement, including the duties, timings, confidentiality and disciplinary conditions set out by the Trust. I understand that signing below confirms my acceptance.'

// Shown only when HR has no active policy in company_policies, so the form is
// never blocked by an empty table.
const FALLBACK_POLICIES = [{ id: 'fallback', title: 'Volunteer Policy', content: POLICY_TEXT }]

const readCachedWorker = () => {
  try {
    return JSON.parse(localStorage.getItem('ucs_worker') || 'null')
  } catch {
    return null
  }
}

const formatSignedAt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SignatureConsent() {
  const [accepted, setAccepted] = useState(false)
  const [capturedSignature, setCapturedSignature] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [error, setError] = useState('')
  const [worker, setWorker] = useState(readCachedWorker)

  const [documentsNeeded, setDocumentsNeeded] = useState([])
  const [documentsOther, setDocumentsOther] = useState('')
  const [docsBusy, setDocsBusy] = useState(false)

  const [policies, setPolicies] = useState([])
  const [policiesLoading, setPoliciesLoading] = useState(true)
  // A failed read is NOT the same as an empty table. Falling back to the
  // built-in policy on a network error would let a volunteer tick "I accept"
  // against text the Trust has since replaced, so the two cases are kept apart
  // and a failure blocks signing instead.
  const [policiesFailed, setPoliciesFailed] = useState(false)

  const [sigState, setSigState] = useState({
    signature_url: null,
    signature_status: null,
    signature_signed_at: null,
  })
  const [resigning, setResigning] = useState(false)

  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const otherTimer = useRef(null)

  // A stored image that is not a draft is the legal record, so the volunteer
  // must go through "Update signature" rather than just re-saving.
  const isLocked = Boolean(sigState.signature_url) && sigState.signature_status === 'signed'
  const policyList = policies.length ? policies : FALLBACK_POLICIES
  // Consent gates the pad as well as the submit button, otherwise the pad sits
  // open above an unaccepted policy and the locked placeholder is unreachable.
  // A failed policy load closes the pad too: there is nothing to consent to.
  const onPad = accepted && !policiesFailed && (!isLocked || resigning)

  const showWizard = () => {
    document.getElementById('login-screen').style.display = 'none'
    document.getElementById('wizard-screen').classList.remove('hidden')
  }

  // Signature state and the active policies come back in one round-trip, so a
  // volunteer is never asked to sign text HR has since replaced.
  const loadServerState = async () => {
    setPoliciesLoading(true)
    setPoliciesFailed(false)
    try {
      const data = await api.signature()
      // An empty array here is legitimate (company_policies not seeded yet) and
      // may fall back; a thrown request may not.
      setPolicies(Array.isArray(data.policies) ? data.policies : [])
      setSigState({
        signature_url: data.signature_url || null,
        signature_status: data.signature_status || null,
        signature_signed_at: data.signature_signed_at || null,
      })
    } catch {
      setPolicies([])
      setSigState({ signature_url: null, signature_status: null, signature_signed_at: null })
      setPoliciesFailed(true)
    } finally {
      setPoliciesLoading(false)
    }

    try {
      const profile = await api.myProfile()
      const w = profile?.user ?? profile
      if (w) {
        localStorage.setItem('ucs_worker', JSON.stringify(w))
        setWorker(w)
      }
      const { selected, otherText } = parseDocumentsValue(w?.documents_value, w?.documents_other)
      setDocumentsNeeded(selected)
      setDocumentsOther(otherText)
    } catch {
      // Leave the dropdown empty rather than showing a stale selection.
    }
  }

  useEffect(() => {
    localStorage.removeItem('ucs_onboarding')
    if (!localStorage.getItem('ucs_token')) return
    api.myProfile()
      .then(() => {
        showWizard()
        return loadServerState()
      })
      .catch(() => {
        localStorage.removeItem('ucs_token')
        localStorage.removeItem('ucs_worker')
        setWorker(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (otherTimer.current) clearTimeout(otherTimer.current)
  }, [])

  const showToast = (msg, type = 'success') => {
    const t = document.createElement('div')
    t.className = `toast toast-${type}`
    t.textContent = msg
    document.getElementById('toast-container')?.appendChild(t)
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300) }, 3000)
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
      setWorker(d.user)
      showWizard()
      await loadServerState()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const doLogout = () => {
    localStorage.removeItem('ucs_token')
    localStorage.removeItem('ucs_worker')
    setAccepted(false)
    setCapturedSignature(null)
    setSubmitted(false)
    setResigning(false)
    setDocumentsNeeded([])
    setDocumentsOther('')
    setSigState({ signature_url: null, signature_status: null, signature_signed_at: null })
    setPolicies([])
    setPoliciesLoading(true)
    setPoliciesFailed(false)
    setWorker(null)
    setError('')
    document.getElementById('wizard-screen').classList.add('hidden')
    document.getElementById('login-screen').style.display = ''
  }

  const clearSignature = () => setCapturedSignature(null)

  const toggleAccepted = (next) => {
    setAccepted(next)
    // Un-ticking withdraws consent, so a signature already drawn must go too.
    if (!next) clearSignature()
  }

  // ---- Documents handed over ----

  const persistDocuments = async (selected, other) => {
    setDocsBusy(true)
    try {
      await api.saveDocumentsNeeded(serializeSelection(selected), other)
    } catch (err) {
      showToast('Could not save the document: ' + err.message, 'error')
    } finally {
      setDocsBusy(false)
    }
  }

  const selectDocument = (value) => {
    const selected = value ? [value] : []
    // Dropping "Other" must clear its name, or a stale one is left behind.
    const other = value === OTHER_DOC ? documentsOther : ''
    setDocumentsNeeded(selected)
    setDocumentsOther(other)
    persistDocuments(selected, other)
  }

  const onOtherChange = (text) => {
    setDocumentsOther(text)
    if (otherTimer.current) clearTimeout(otherTimer.current)
    otherTimer.current = setTimeout(() => persistDocuments(documentsNeeded, text), 600)
  }

  // ---- Signature pad ----

  const prepareCanvas = (canvas) => {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width) return null
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    // Resizing the backing store clears it, which is what we want for a fresh pad.
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    // Draw in CSS pixels so the stroke stays 2.2px on every display density.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#232019'
    ctx.fillStyle = '#232019'
    return ctx
  }

  const hasInk = (canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true
    }
    return false
  }

  const startDrawing = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = prepareCanvas(canvas)
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    drawingRef.current = true
    // Capture keeps the stroke going even when the finger leaves the pad.
    try { canvas.setPointerCapture(e.pointerId) } catch { /* not supported */ }
    // A single tap should still leave a mark.
    ctx.beginPath()
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const draw = (e) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    e.preventDefault()
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const endDrawing = (e) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    try { canvasRef.current?.releasePointerCapture(e.pointerId) } catch { /* already released */ }
  }

  const startResign = () => {
    setResigning(true)
    setCapturedSignature(null)
    // Re-signing means re-accepting whatever HR publishes now.
    setAccepted(false)
  }

  const cancelResign = () => {
    setResigning(false)
    setCapturedSignature(null)
  }

  // Save is a draft; the record is only locked by Submit (or immediately on a
  // re-sign, which the backend treats as a final commit).
  const saveSignature = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!hasInk(canvas)) return showToast('Please draw your signature first', 'error')
    const dataUrl = canvas.toDataURL('image/png')
    setCapturedSignature(dataUrl)
    setSaving(true)
    try {
      const res = await api.uploadSignature(
        dataUrl.split(',')[1],
        'image/png',
        resigning ? { re_sign: true } : {},
      )
      setSigState({
        signature_url: res.signature_url,
        signature_status: res.signature_status,
        signature_signed_at: res.signature_signed_at,
      })
      if (res.signature_status === 'signed') {
        setResigning(false)
        setAccepted(false)
        setCapturedSignature(null)
        setSubmitted(true)
        showToast(res.resigned ? 'Signature updated' : 'Signature recorded')
      } else {
        showToast('Signature saved!')
      }
    } catch (err) {
      if (err.status === 409 && err.data?.can_resign) {
        setSigState({
          signature_url: err.data.signature_url,
          signature_status: err.data.signature_status,
          signature_signed_at: err.data.signature_signed_at,
        })
      }
      showToast(err.message || 'Failed to save the signature', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!accepted) return showToast('Please accept the policy first', 'error')
    if (!capturedSignature) return showToast('Please save your signature first', 'error')
    setLoading(true)
    try {
      const res = await api.commitSignature()
      setSigState({
        signature_url: res.signature_url,
        signature_status: res.signature_status,
        signature_signed_at: res.signature_signed_at,
      })
      setSubmitted(true)
    } catch (err) {
      showToast('Failed: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const spinner = (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
    </svg>
  )

  return (
    <div className="sf-page">
      <div id="toast-container" />

      <div id="login-screen" className="sf-auth">
        <div className="sf-auth-card">
          <div className="sf-auth-brand">
            <div className="sf-mark">U</div>
            <h1 className="sf-auth-title">Welcome</h1>
            <p className="sf-auth-sub">Sign in to sign the volunteer policy</p>
          </div>

          {error && <div id="login-error" className="sf-alert">{error}</div>}

          <div className="sf-stack">
            <div className="sf-field">
              <label className="sf-label" htmlFor="login-id">Login ID / Email</label>
              <input
                id="login-id"
                type="text"
                placeholder="Enter your login ID or email"
                autoComplete="username"
                className="sf-control"
              />
            </div>
            <div className="sf-field">
              <label className="sf-label" htmlFor="login-pass">Password</label>
              <input
                id="login-pass"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                className="sf-control"
              />
            </div>
            <button
              onClick={doLogin}
              id="login-btn"
              disabled={loginLoading}
              className="sf-btn sf-btn-primary"
            >
              <span id="login-btn-text">{loginLoading ? 'Signing in...' : 'Sign In'}</span>
              <span id="login-btn-spinner" className={loginLoading ? '' : 'hidden'}>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div id="wizard-screen" className="hidden sf-wizard">
        <header className="sf-topbar">
          <div>
            <p className="sf-kicker">Signing as</p>
            <p className="sf-who">{worker?.name || 'Volunteer'}</p>
          </div>
          <button onClick={doLogout} title="Logout" aria-label="Log out" className="sf-icon-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>
        </header>

        {submitted ? (
          <div className="sf-sheet anim">
            <div className="sf-done">
              <div className="sf-done-tick" aria-hidden="true">
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="sf-h1">Signed!</h2>
              <p className="sf-muted">
                Your signature has been recorded{sigState.signature_signed_at ? ` on ${formatSignedAt(sigState.signature_signed_at)}` : ''}.
                We'll review and get back to you soon.
              </p>
              {sigState.signature_url && (
                <div className="sf-sig-frame">
                  <img
                    src={sigState.signature_url}
                    alt="Your recorded signature"
                    className="sf-sig-img"
                    crossOrigin="anonymous"
                  />
                </div>
              )}
              <button onClick={doLogout} className="sf-btn sf-btn-primary sf-btn-block mt-6">Finish</button>
            </div>
          </div>
        ) : (
          <div className="sf-stack-lg">
            <section className="sf-sheet anim">
              <div className="sf-section-head">
                <span className="sf-section-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h8M8 17h5" />
                  </svg>
                </span>
                <h2 className="sf-h2">Volunteer Policy</h2>
              </div>

              {policiesFailed ? (
                <>
                  <p className="sf-alert">
                    The current policy could not be loaded, so signing is paused. Check your
                    connection and try again — we will not substitute an older policy for the
                    one you are agreeing to.
                  </p>
                  <div className="sf-actions">
                    <button
                      type="button"
                      className="sf-btn sf-btn-secondary"
                      onClick={loadServerState}
                      disabled={policiesLoading}
                    >
                      {policiesLoading ? 'Retrying…' : 'Try again'}
                    </button>
                  </div>
                </>
              ) : policiesLoading ? (
                <p className="sf-muted">Loading the current policy…</p>
              ) : (
                <div
                  className="sf-policies"
                  tabIndex={0}
                  role="group"
                  aria-label="Volunteer policies, scroll to read all"
                >
                  {policyList.map((policy) => (
                    <div key={policy.id} className="sf-policy">
                      <h3 className="sf-policy-title">{policy.title}</h3>
                      <p className="sf-policy-text">{policy.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* There is nothing to consent to while the policy is unavailable,
                  so the checkbox is not offered at all. */}
              {!policiesFailed && (
                <label className="sf-accept">
                  <input
                    type="checkbox"
                    id="accept-policy"
                    checked={accepted}
                    disabled={policiesLoading}
                    onChange={(e) => toggleAccepted(e.target.checked)}
                    className="sf-check"
                  />
                  <span className="sf-accept-text">
                    I accept
                    {policyList.length > 1 ? ' all of the policies above' : ' the policy above'}
                  </span>
                </label>
              )}
            </section>

            <section className="sf-sheet anim">
              <div className="sf-section-head">
                <span className="sf-section-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 7h18v13H3z" /><path d="M3 7l3-3h12l3 3" /><path d="M9 12h6" />
                  </svg>
                </span>
                <h2 className="sf-h2">Documents Needed</h2>
              </div>

              <div className="sf-grid">
                <div className="sf-field">
                  <label className="sf-label" htmlFor="documents-needed">Document you are submitting</label>
                  <select
                    id="documents-needed"
                    value={documentsNeeded[0] || ''}
                    disabled={docsBusy}
                    onChange={(e) => selectDocument(e.target.value)}
                    className="sf-control"
                  >
                    <option value="">Select a document</option>
                    {DOC_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                {documentsNeeded.includes(OTHER_DOC) && (
                  <div className="sf-field">
                    <label className="sf-label" htmlFor="documents-other">Name of document</label>
                    <input
                      id="documents-other"
                      type="text"
                      value={documentsOther}
                      disabled={docsBusy}
                      onChange={(e) => onOtherChange(e.target.value)}
                      placeholder="e.g. Passport"
                      className="sf-control"
                    />
                  </div>
                )}
              </div>

              <p className="sf-hint">
                {docsBusy ? 'Saving…' : 'Saved as soon as you choose. HR sees this on your form.'}
              </p>
            </section>

            <section className="sf-sheet anim">
              <div className="sf-section-head">
                <span className="sf-section-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 17c3-6 6-9 9-9s5 2 9 6" /><path d="M3 21c3-4 6-6 9-6s6 2 9 5" />
                  </svg>
                </span>
                <h2 className="sf-h2">Digital Signature</h2>
              </div>

              {isLocked && !resigning ? (
                <div className="sf-locked">
                  <p className="sf-locked-note">
                    Signature recorded{sigState.signature_signed_at ? ` on ${formatSignedAt(sigState.signature_signed_at)}` : ''}.
                  </p>
                  {sigState.signature_url && (
                    <div className="sf-sig-frame">
                      <img
                        src={sigState.signature_url}
                        alt="Your recorded signature"
                        className="sf-sig-img"
                        crossOrigin="anonymous"
                      />
                    </div>
                  )}
                  <button onClick={startResign} className="sf-btn sf-btn-ghost">Update signature</button>
                </div>
              ) : onPad ? (
                <>
                  {resigning && (
                    <p className="sf-notice">
                      Draw a new signature below and save it to replace the one on record.
                    </p>
                  )}
                  {capturedSignature ? (
                    <div className="sf-signature-view">
                      <div className="sf-sig-frame">
                        <img src={capturedSignature} alt="Your signature" className="sf-sig-img" />
                      </div>
                      <p className="sf-ok">Signature captured</p>
                      <div className="sf-actions">
                        <button className="sf-btn sf-btn-ghost" onClick={clearSignature} disabled={saving}>
                          Clear &amp; Redraw
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="sf-muted mt-3">
                        Draw your signature below using your mouse or finger.
                      </p>
                      <canvas
                        ref={canvasRef}
                        id="signature-pad"
                        className="sf-pad"
                        onPointerDown={startDrawing}
                        onPointerMove={draw}
                        onPointerUp={endDrawing}
                        onPointerCancel={endDrawing}
                        onPointerLeave={endDrawing}
                        aria-label="Signature drawing pad"
                      />
                      <div className="sf-actions">
                        <button className="sf-btn sf-btn-secondary" onClick={saveSignature} disabled={saving}>
                          {saving ? 'Saving…' : resigning ? 'Update signature' : 'Save Signature'}
                        </button>
                        {resigning && (
                          <button className="sf-btn sf-btn-ghost" onClick={cancelResign} disabled={saving}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="sf-placeholder">
                  <p className="sf-muted">Accept the policy above to unlock the signature pad.</p>
                </div>
              )}
            </section>

            {onPad && (
              <button
                onClick={handleSubmit}
                disabled={loading || !accepted || !capturedSignature}
                className="sf-btn sf-btn-primary sf-btn-block anim"
              >
                {loading ? <span className="sf-btn-busy">{spinner} Submitting…</span> : 'Submit Signature'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
