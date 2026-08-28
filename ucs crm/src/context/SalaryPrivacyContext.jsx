import React, { createContext, useContext } from 'react'
import useAccessCode from '../panels/accounts/components/AccessGate'
import { useAccessCodeStore } from './accessCodeStore'

const SalaryPrivacyContext = createContext({
  isSalaryUnlocked: false,
  promptUnlock: () => {},
  unlockSalary: async () => {},
  lockSalary: () => {},
  formatSalary: () => '',
  maskSalary: () => '',
})

export function SalaryPrivacyProvider({ children }) {
  const isSalaryUnlocked = useAccessCodeStore((s) => s.unlocked)
  const access = useAccessCode()

  const promptUnlock = (callback) => {
    if (isSalaryUnlocked) {
      if (typeof callback === 'function') callback()
      return
    }
    access.open().then(ok => {
      if (ok && typeof callback === 'function') callback()
    })
  }

  const lockSalary = () => {
    useAccessCodeStore.getState().reset()
  }

  const formatSalary = (amount, prefix = '₹') => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
      return `${prefix}0`
    }
    if (isSalaryUnlocked) {
      return `${prefix}${parseFloat(amount).toLocaleString('en-IN')}`
    }
    return `${prefix} XXX`
  }

  const maskSalary = (amount, prefix = '₹', placeholder = 'XXX') => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
      return placeholder
    }
    if (isSalaryUnlocked) {
      return `${prefix}${parseFloat(amount).toLocaleString('en-IN')}`
    }
    return `${prefix} ${placeholder}`
  }

  return (
    <SalaryPrivacyContext.Provider
      value={{
        isSalaryUnlocked,
        promptUnlock,
        unlockSalary: async () => ({}),
        lockSalary,
        formatSalary,
        maskSalary,
      }}
    >
      {children}
      {access.modal}
    </SalaryPrivacyContext.Provider>
  )
}

export function useSalaryPrivacy() {
  return useContext(SalaryPrivacyContext)
}
