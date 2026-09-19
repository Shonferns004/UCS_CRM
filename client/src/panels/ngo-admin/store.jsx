import { useContext } from 'react'
import { UcsContext } from '../../store'
export function useNgoAdmin() {
  const ctx = useContext(UcsContext)
  if (!ctx) throw new Error('useNgoAdmin must be used within UcsProvider')
  return ctx
}
