import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

const POLICY_TEXT = 'I have read, understood and agree to abide by the Volunteer Guidelines and Code of Conduct of Being Sevak Charitable Trust. I accept the terms of my volunteer engagement, including the duties, timings, confidentiality and disciplinary conditions set out by the Trust. I understand that signing below confirms my acceptance.'

const readCachedWorker = () => {
  try {
    return JSON.parse(localStorage.getItem('ucs_worker') || 'null')
  } catch {
    return null
  }
}

export default function SignatureConsent() {
  const [accepted, setAccepted] = useState(false)
  const [capturedSignature, setCapturedSignature] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [error, setError] = useState('')
  const [worker, setWorker] = useState(readCachedWorker)
  const canvasRef = useRef(null)

  useEffect(() => {
    localStorage.removeItem('ucs_onboarding')
    if (!localStorage.getItem('ucs_token')) return
    api.myProfile().then(() => {
      document.getElementById('login-screen').style.display = 'none'
      document.getElementById('wizard-screen').classList.remove('hidden')
    }).catch(() => {
      localStorage.removeItem('ucs_token')
      localStorage.removeItem('ucs_worker')
      setWorker(null)
    })
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
    setAccepted(false)
    setCapturedSignature(null)
    setSubmitted(false)
    setWorker(null)
    setError('')
    document.getElementById('wizard-screen').classList.add('hidden')
    document.getElementById('login-screen').style.display = ''
  }

  const clearSignature = () => setCapturedSignature(null)

  const toggleAccepted = (next) => {
    setAccepted(next)
    clearSignature()
  }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const hasContent = imageData.data.some(ch => ch !== 0)
    if (!hasContent) return showToast('Please draw your signature first', 'error')
    setCapturedSignature(canvas.toDataURL('image/png'))
    showToast('Signature saved!')
  }

  const startDrawing = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000'
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    const move = (ev) => {
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x, y)
    }
    const up = () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('pointerleave', up)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('pointerleave', up)
  }

  const handleSubmit = async () => {
    if (!accepted) return showToast('Please accept the policy first', 'error')
    if (!capturedSignature) return showToast('Please save your signature first', 'error')
    setLoading(true)
    try {
      await api.uploadSignature(capturedSignature.split(',')[1], 'image/png')
      setSubmitted(true)
    } catch (err) {
      showToast('Failed: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div id="toast-container"></div>

      <div id="login-screen" className="min-h-screen flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-500 text-white flex items-center justify-center text-xl font-bold shadow-sm">U</div>
            <h1 className="text-xl font-bold text-gray-900">Welcome</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to sign the volunteer policy</p>
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

      <div id="wizard-screen" className="hidden min-h-screen py-6 px-4 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Signing as</p>
            <p className="text-base font-bold text-gray-900">{worker?.name || 'Volunteer'}</p>
          </div>
          <button onClick={doLogout} title="Logout" className="w-8 h-8 rounded-full border border-gray-200 bg-transparent cursor-pointer flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-16 anim">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Signed!</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">Your signature has been recorded. We'll review and get back to you soon.</p>
            <button onClick={doLogout} className="w-full rounded-xl bg-blue-500 text-white font-semibold text-sm py-2.5 hover:bg-blue-600 transition-colors mt-8 min-h-[44px]">Finish</button>
          </div>
        ) : (
          <div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 anim">
              <h2 className="text-base font-bold text-gray-900 mb-2">Volunteer Policy</h2>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">{POLICY_TEXT}</p>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={accepted} onChange={e => toggleAccepted(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-500 flex-shrink-0 cursor-pointer" />
                <span className="text-sm font-semibold text-gray-900">I accept</span>
              </label>
            </div>

            {accepted ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 anim">
                <h2 className="text-base font-bold text-gray-900 mb-1">Digital Signature</h2>
                {capturedSignature ? (
                  <div className="text-center mt-3">
                    <div className="max-w-xs mx-auto mb-4"><img src={capturedSignature} className="w-full border border-gray-300 rounded-xl" style={{ maxHeight: 120 }} /></div>
                    <p className="text-sm text-green-600 font-medium mb-4">Signature captured</p>
                    <div className="flex gap-3 justify-center">
                      <button className="rounded-lg border border-gray-300 bg-white text-gray-700 text-sm px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors" onClick={clearSignature}>Clear & Redraw</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500 mb-4 mt-3">Draw your signature below using your mouse or finger.</p>
                    <canvas ref={canvasRef} width="500" height="150" onPointerDown={startDrawing}
                      style={{ width: '100%', maxWidth: 500, height: 150, border: '2px dashed #d1d5db', borderRadius: 12, cursor: 'crosshair', background: '#fafafa', touchAction: 'none', display: 'block', margin: '0 auto' }} />
                    <div className="flex gap-3 justify-center mt-4">
                      <button className="rounded-lg bg-blue-500 text-white font-medium text-sm px-6 py-2.5 hover:bg-blue-600 cursor-pointer transition-colors" onClick={saveSignature}>Save Signature</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-8 mb-4 text-center anim">
                <p className="text-sm text-gray-400">Accept the policy above to unlock the signature pad.</p>
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading || !accepted || !capturedSignature}
              className="w-full rounded-xl bg-emerald-500 text-white font-semibold text-sm py-2.5 hover:bg-emerald-600 transition-colors disabled:opacity-50 min-h-[44px]">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75"/></svg>
                  Submitting...
                </span>
              ) : 'Submit Signature'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
