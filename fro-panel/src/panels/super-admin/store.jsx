import { useContext } from 'react'
import { UcsContext } from '../../store'

export function useSA() {
  const ctx = useContext(UcsContext)
  if (!ctx) throw new Error('useSA must be used within UcsProvider')
  return ctx
}
