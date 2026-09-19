import { useContext } from 'react'
import { ToastContext } from '../components/ToastContext.jsx'

export default function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return { addToast: () => {}, removeToast: () => {} }
  }
  return { addToast: ctx.addToast, removeToast: ctx.removeToast }
}