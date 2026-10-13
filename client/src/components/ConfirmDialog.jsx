import { useEffect, useRef } from 'react'

const VARIANTS = {
  danger: { primary: '#D92D20', primaryHover: '#B42318', soft: '#FDECEC' },
  warning: { primary: '#B7791F', primaryHover: '#96620F', soft: '#FFF7E8' },
  primary: { primary: '#2F7DF4', primaryHover: '#1E63CE', soft: '#E8F3FF' },
}

function Icon({ variant }) {
  if (variant === 'warning') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }
  if (variant === 'primary') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <circle cx="12" cy="16" r="1" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  variant = 'danger', busy = false, onConfirm, onCancel, children,
}) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const prevActive = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => dialogRef.current?.focus(), 0)
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      if (prevActive && typeof prevActive.focus === 'function') prevActive.focus()
    }
  }, [open, busy, onCancel])

  if (!open) return null
  const c = VARIANTS[variant] || VARIANTS.danger

  return (
    <div
      onClick={busy ? undefined : onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 99993, padding: 16,
        background: 'rgba(18,35,63,.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'cd-fade .15s ease',
      }}
    >
      <style>{`
        @keyframes cd-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cd-up { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 32px))', background: '#fff',
          border: '1px solid #DCE7F5', borderRadius: 14, outline: 'none',
          boxShadow: '0 24px 60px rgba(18,35,63,.24)',
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          animation: 'cd-up .2s ease',
        }}
      >
        <div style={{ padding: '20px 22px 4px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: c.soft, color: c.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon variant={variant} />
          </span>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10213D' }}>{title}</div>
            {message && (
              <div style={{ fontSize: 13, color: '#6D7E95', lineHeight: 1.55, marginTop: 4 }}>{message}</div>
            )}
          </div>
        </div>

        {children && <div style={{ padding: '12px 22px 0' }}>{children}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '18px 22px 20px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 38, padding: '0 16px', borderRadius: 8,
              border: '1px solid #DCE7F5', background: '#fff', color: '#33475F',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            style={{
              height: 38, padding: '0 16px', borderRadius: 8, border: 'none',
              background: c.primary, color: '#fff',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.75 : 1,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = c.primaryHover }}
            onMouseLeave={(e) => { e.currentTarget.style.background = c.primary }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
