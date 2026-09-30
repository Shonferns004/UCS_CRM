import { useEffect, useState } from 'react'

let push = () => {}
const items = []

export function toast(message, type = 'info', duration = 3200) {
  const id = Math.random().toString(36).slice(2)
  items.push({ id, message, type })
  push()
  setTimeout(() => {
    const i = items.findIndex((t) => t.id === id)
    if (i >= 0) {
      items.splice(i, 1)
      push()
    }
  }, duration)
}

export default function ToastContainer() {
  const [, force] = useState(0)

  useEffect(() => {
    push = () => force((n) => n + 1)
    return () => {
      push = () => {}
    }
  }, [])

  if (!items.length) return null

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
