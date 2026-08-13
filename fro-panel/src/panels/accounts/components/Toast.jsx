import { useEffect } from 'react'

export default function Toast({ message, type, visible, onClose }) {
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [visible, onClose])

  if (!visible) return null

  const bg = type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#2563eb'
  const icon = type === 'success' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
  ) : type === 'error' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
  )

  return (
    <div style={{ position:'fixed', top:20, right:220, zIndex:2000 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,.15)', color:'#fff', fontSize:13, fontWeight:500, background:bg }}>
        {icon}
        <span>{message}</span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', cursor:'pointer', opacity:.7, padding:0, display:'flex', marginLeft:4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  )
}
