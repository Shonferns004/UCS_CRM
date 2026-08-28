import React, { createContext, useContext, useState } from 'react'
import { api } from '../api/auth'

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
  const [password, setPassword] = useState('')
  const [showPasswordText, setShowPasswordText] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingCallback, setPendingCallback] = useState(null)

  const promptUnlock = (callback) => {
    if (isSalaryUnlocked) {
      if (typeof callback === 'function') callback()
      return
    }
    setPassword('')
    setError('')
    setShowPasswordText(false)
    setPendingCallback(() => (typeof callback === 'function' ? callback : null))
    setModalOpen(true)
  }

  const unlockSalary = async (pwd) => {
    setLoading(true)
    setError('')
    try {
      await api('/salary/verify-password', {
        method: 'POST',
        body: JSON.stringify({ password: pwd }),
        _prefix: 'ucs',
      })
      setIsSalaryUnlocked(true)
      setModalOpen(false)
      if (pendingCallback) {
        pendingCallback()
        setPendingCallback(null)
      }
      return { success: true }
    } catch (err) {
      setError(err.message || 'Incorrect password. Please try again.')
      return { success: false, error: err.message }
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
    if (!password.trim()) {
      setError('Please enter your password')
      return
    }
    await unlockSalary(password)
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
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(2px)',
          }}
          onClick={() => {
            setModalOpen(false)
            setPendingCallback(null)
          }}
        >
          <div
            className="modal-card"
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: '24px 28px',
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
              animation: 'fadeIn .15s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                🔒
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
                  Confidential Salary Access
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                  Enter password to view & update salary.
                </p>
              </div>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Account / Master Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    placeholder="Enter password..."
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError('')
                    }}
                    autoFocus
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 36px 8px 12px',
                      borderRadius: 6,
                      border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
                      fontSize: 14,
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: '#6b7280',
                      padding: 2,
                    }}
                    title={showPasswordText ? 'Hide password' : 'Show password'}
                  >
                    {showPasswordText ? '🙈' : '👁️'}
                  </button>
                </div>
                {error && (
                  <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 500 }}>
                    {error}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setModalOpen(false)
                    setPendingCallback(null)
                  }}
                  style={{ padding: '7px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !password.trim()}
                  style={{
                    padding: '7px 18px',
                    fontSize: 13,
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'var(--sage, #5B6B4E)',
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  {loading ? 'Verifying...' : 'Unlock Salary'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SalaryPrivacyContext.Provider>
  )
}

export function useSalaryPrivacy() {
  return useContext(SalaryPrivacyContext)
}
