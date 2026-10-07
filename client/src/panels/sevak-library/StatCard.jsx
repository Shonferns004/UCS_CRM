import { useEffect, useRef } from 'react'

// Lightweight count-up so the embedded panel keeps the standalone look without
// pulling in gsap. First render sets the final value when the tab is hidden
// (IntersectionObserver never fires), so numbers appear immediately on mount.
export default function StatCard({
  icon, label, value, sub, color, delay = 0,
  dot = false, pct = null, trend = null, onClick = null
}) {
  const numRef = useRef(null)
  const started = useRef(false)
  const clickable = typeof onClick === 'function'

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

  const Wrapper = clickable ? 'button' : 'div'

  return (
    <Wrapper
      className={`stat-card${clickable ? ' clickable' : ''}`}
      style={{ '--stat-color': color }}
      onClick={clickable ? onClick : undefined}
      type={clickable ? 'button' : undefined}
    >
      <span className="stat-accent" />
      <div className="stat-icon" style={{ background: color + '1a', color }}>
        {icon}
      </div>
      <div className="stat-body">
        <span className="stat-label">
          {dot && <i className="stat-dot" />}
          {label}
        </span>
        <strong className="stat-value" ref={numRef}>0</strong>
        <div className="stat-foot">
          {pct !== null && (
            <span className="stat-pct" title={`${pct}% of total applications`}>
              <span className="stat-pctbar"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
              <span className="stat-pct-text">{pct}% of total</span>
            </span>
          )}
          {sub && <span className="stat-sub">{sub}</span>}
          {trend && (
            <span className="stat-trend" style={{ color: trend.color || 'var(--muted)' }}>
              {trend.up !== undefined && (trend.up ? '▲' : '▼')} {trend.label}
            </span>
          )}
        </div>
        {clickable && <span className="stat-view">View list →</span>}
      </div>
    </Wrapper>
  )
}
