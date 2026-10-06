import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export default function StatCard({ icon, label, value, sub, color, delay = 0 }) {
  const cardRef = useRef(null)
  const numRef = useRef(null)

  useEffect(() => {
    const card = cardRef.current
    const proxy = { v: 0 }
    gsap.set(card, { opacity: 0, y: 18 })
    gsap.to(card, { opacity: 1, y: 0, duration: 0.5, delay, ease: 'power2.out' })
    if (numRef.current) {
      gsap.to(proxy, {
        v: value,
        duration: 1,
        delay: delay + 0.15,
        ease: 'power2.out',
        onUpdate: () => {
          numRef.current.textContent = Math.round(proxy.v).toLocaleString('en-IN')
        }
      })
    }
  }, [value, delay])

  return (
    <div className="stat-card" ref={cardRef} style={{ '--stat-color': color }}>
      <div className="stat-icon" style={{ background: color + '1a', color }}>
        {icon}
      </div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value" ref={numRef}>
          0
        </strong>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  )
}
