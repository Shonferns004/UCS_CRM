import { useContext } from 'react'
import { UcsContext } from '../../store'
export function useAccounts() {
  const ctx = useContext(UcsContext)
  if (!ctx) throw new Error('useAccounts must be used within UcsProvider')
  return ctx
}
