import { useContext } from 'react'
import { UcsContext } from '../../store'
export function useTelecaller() {
  const ctx = useContext(UcsContext)
  if (!ctx) throw new Error('useTelecaller must be used within UcsProvider')
  return ctx
}
