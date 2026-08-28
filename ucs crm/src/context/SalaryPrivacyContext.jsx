import React, { createContext, useContext, useState } from 'react'
import { getToken } from '../api/auth'
import { API_BASE } from '../lib/apiBase'

const SalaryPrivacyContext = createContext({
  isSalaryUnlocked: false,
  promptUnlock: () => {},
  unlockSalary: async () => {},
  lockSalary: () => {},
  formatSalary: () => '',
  maskSalary: () => '',
})

export function SalaryPrivacyProvider({ children }) {
  const [isSalaryUnlocked, setIsSalaryUnlocked] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [mode, setMode] = useState('enter') // 'enter' | 'create'
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingCallback, setPendingCallback] = useState(null)

  const promptUnlock = (callback) => {
    if (isSalaryUnlocked) {
      if (typeof callback === 'function') callback()
      return
    }
    setCode('')
    setError('')
    setPendingCallback(() => (typeof callback === 'function' ? callback : null))
    const token = getToken('ucs')
    fetch(`${API_BASE}/salary/access-code/status`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(res => res.json())
      .then(data => {
        setMode(data && data.set ? 'enter' : 'create')
        setModalOpen(true)
      })
      .catch(() => {
        setMode('enter')
        setModalOpen(true)
      })
  }

  const unlockSalary = async (enteredCode) => {
    setLoading(true)
    setError('')
    try {
      const token = getToken('ucs')
      const endpoint = mode === 'create'
        ? `${API_BASE}/salary/access-code`
        : `${API_BASE}/salary/access-code/verify`
      const body = mode === 'create'
        ? { code: enteredCode }
        : { code: enteredCode }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({ message: res.statusText }))
      if (!res.ok) {
        throw new Error(data.message || 'Incorrect code. Please try again.')
      }
      if (mode === 'verify' && data.ok === false) {
        throw new Error(data.message || 'Incorrect code. Please try again.')
      }
      setIsSalaryUnlocked(true)
      setModalOpen(false)
      if (pendingCallback) {
        pendingCallback()
        setPendingCallback(null)
      }
      return { success: true }
    } catch (err) {
      const msg = err.message || 'Incorrect code. Please try again.'
      if (/already set/i.test(msg)) {
        setMode('enter')
        setError('A code already exists. Enter it instead.')
      } else {
        setError(msg)
      }
      return { success: false, error: msg }
    } finally {
      setLoading(false)
    }
  }

  const lockSalary = () => {
    setIsSalaryUnlocked(false)
  }

  const formatSalary = (amount, prefix = '₹') => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
      return `${prefix}0`
    }
    if (isSalaryUnlocked) {
      return `${prefix}${parseFloat(amount).toLocaleString('en-IN')}`
    }
    return `${prefix} ••••••`
  }

  const maskSalary = (amount, prefix = '₹', placeholder = 'XXXX') => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
      return placeholder
    }
    if (isSalaryUnlocked) {
      return `${prefix}${parseFloat(amount).toLocaleString('en-IN')}`
    }
    return `${prefix} ${placeholder}`
  }

  const handleModalSubmit = async (e) => {
    if (e) e.preventDefault()
    if (code.length !== 4) {
      setError('Enter the 4-digit code.')
      return
    }
    await unlockSalary(code)
  }

  return (
    <SalaryPrivacyContext.Provider
      value={{
        isSalaryUnlocked,
        promptUnlock,
        unlockSalary,
        lockSalary,
        formatSalary,
        maskSalary,
      }}
    >
      {children}

      {modalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 16,
            animation: 'spcFade .18s ease',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setModalOpen(false)
              setPendingCallback(null)
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              maxWidth: 400,
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              animation: 'spcPop .2s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid #eef1f5' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: mode === 'create' ? '#EFF6FF' : '#F0FDF4',
                  boxShadow: 'inset 0 0 0 1px ' + (mode === 'create' ? 'rgba(37,99,235,0.2)' : 'rgba(22,163,74,0.2)'),
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={mode === 'create' ? '#2563eb' : '#16a34a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  {mode === 'create'
                    ? <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    : <path d="M7 11V7a5 5 0 0 1 10 0v4" />}
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                {mode === 'create' ? 'Create Salary Access Code' : 'Confidential Salary Access'}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                {mode === 'create'
                  ? 'No access code exists yet. Create a 4-digit code so only authorized users can view salary details.'
                  : 'Enter the 4-digit access code to view & update salary.'}
              </p>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div style={{ padding: 20 }}>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                    setError('')
                  }}
                  placeholder="••••"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: 26,
                    fontWeight: 600,
                    textAlign: 'center',
                    letterSpacing: 14,
                    boxSizing: 'border-box',
                    borderRadius: 12,
                    outline: 'none',
                    color: '#0f172a',
                    border: error ? '1px solid #ef4444' : '1px solid #d1d9e4',
                    background: error ? '#fef2f2' : '#f8fafc',
                    transition: 'border-color .15s, box-shadow .15s',
                    boxShadow: error
                      ? '0 0 0 3px rgba(239,68,68,0.12)'
                      : (code.length === 4 ? '0 0 0 3px rgba(37,99,235,0.12)' : '0 0 0 3px transparent'),
                  }}
                />
                {error && (
                  <div style={{ fontSize: 12.5, color: '#dc2626', marginTop: 10, fontWeight: 500 }}>
                    {error}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpen(false)
                      setPendingCallback(null)
                    }}
                    style={{
                      cursor: 'pointer',
                      padding: '10px 18px',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      background: '#ffffff',
                      color: '#475569',
                      border: '1px solid #d1d9e4',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || code.length !== 4}
                    style={{
                      cursor: loading ? 'default' : 'pointer',
                      padding: '10px 18px',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      opacity: (loading || code.length !== 4) ? 0.55 : 1,
                      boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                    }}
                  >
                    {loading ? 'Checking…' : (mode === 'create' ? 'Create & Continue' : 'Unlock Salary')}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <style>{`
            @keyframes spcFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes spcPop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
          `}</style>
        </div>
      )}
    </SalaryPrivacyContext.Provider>
  )
}

export function useSalaryPrivacy() {
  return useContext(SalaryPrivacyContext)
}
