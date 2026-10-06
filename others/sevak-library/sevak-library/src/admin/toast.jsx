import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

const ToastCtx = createContext(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

let idSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback(
    (message, type = 'success') => {
      const id = ++idSeq
      setToasts((prev) => [...prev.slice(-3), { id, message, type }])
      timers.current[id] = setTimeout(() => dismiss(id), 4000)
    },
    [dismiss]
  )

  const Icon = (t) =>
    t.type === 'success' ? <CheckCircle2 size={17} /> : t.type === 'error' ? <AlertCircle size={17} /> : <Info size={17} />

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">{Icon(t)}</span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
