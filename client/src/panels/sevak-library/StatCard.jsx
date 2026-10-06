import { useEffect, useRef } from 'react'

// Lightweight count-up so the embedded panel keeps the standalone look without
// pulling in gsap. First render sets the final value when the tab is hidden
// (IntersectionObserver never fires), so numbers appear immediately on mount.
export default function StatCard({ icon, label, value, sub, color, delay = 0 }) {
  const numRef = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const el = numRef.current
    if (!el) return
    const target = Number(value) || 0

    const animate = () => {
      started.current = true
      const t0 = performance.now()
      const dur = 1000
      const tick = (now) => {
        const p = Math.min((now - t0) / dur, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        el.textContent = Math.round(target * eased).toLocaleString('en-IN')
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    if (typeof IntersectionObserver === 'undefined') {
      animate()
      return
    }
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started.current) animate()
    }, { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value])

  return (
    <div className="stat-card" style={{ '--stat-color': color }}>
      <div className="stat-icon" style={{ background: color + '1a', color }}>
        {icon}
      </div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value" ref={numRef}>0</strong>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  )
}