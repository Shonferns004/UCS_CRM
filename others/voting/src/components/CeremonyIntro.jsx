import { useEffect, useMemo, useState } from 'react'
import { accentFor } from '../helpers'

// Deterministic pseudo-random from a seed, so the sparkle field is stable across
// re-renders instead of jumping every time the component re-mounts.
function seeded(i) {
  const x = Math.sin(i * 999.91) * 10000
  return x - Math.floor(x)
}

const SPARKLES = Array.from({ length: 26 }, (_, i) => ({
  left: `${4 + seeded(i) * 92}%`,
  bottom: `${-10 + seeded(i + 50) * 40}%`,
  delay: `${seeded(i + 100) * 6}s`,
  duration: `${5 + seeded(i + 150) * 5}s`,
  size: 2 + seeded(i + 200) * 2,
}))

/** Runs the ceremony and hands control back to the app when it is dismissed. */
export default function CeremonyIntro({ session, department, onDone }) {
  const [leaving, setLeaving] = useState(false)
  const accent = useMemo(() => accentFor(department?.order_index ?? 0), [department?.order_index])

  function finish() {
    setLeaving(true)
    // Let the curtain animation land before unmounting, but never let a stuck
    // animation trap the voter on this screen.
    setTimeout(() => onDone(), 620)
  }

  // Escape is a keyboard shortcut for the Skip button, for anyone on a laptop
  // rather than a phone.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`intro${leaving ? ' leaving' : ''}`} role="dialog" aria-label="Award ceremony">
      <button className="intro-skip" onClick={finish}>
        Skip
      </button>

      <div className="spot left" aria-hidden="true" />
      <div className="spot right" aria-hidden="true" />
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="spark"
          aria-hidden="true"
          style={{ left: s.left, bottom: s.bottom, animationDelay: s.delay, animationDuration: s.duration, width: s.size, height: s.size }}
        />
      ))}

      <div className="trophy" aria-hidden="true">
        <div className="shine" />
        <svg viewBox="0 0 100 122" fill="none">
          <defs>
            <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f6dc9a" />
              <stop offset="45%" stopColor="#e8b64c" />
              <stop offset="100%" stopColor="#a9781f" />
            </linearGradient>
          </defs>
          <path
            d="M32 16h36v20c0 15-8 24-18 24s-18-9-18-24V16Z"
            fill="url(#gold)"
            stroke="#8a6218"
            strokeWidth="1.6"
          />
          <path d="M32 20H20a12 12 0 0 0 12 18" stroke="url(#gold)" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M68 20h12a12 12 0 0 1-12 18" stroke="url(#gold)" strokeWidth="5" strokeLinecap="round" fill="none" />
          <rect x="46" y="60" width="8" height="18" fill="url(#gold)" />
          <rect x="32" y="78" width="36" height="9" rx="2.5" fill="url(#gold)" stroke="#8a6218" strokeWidth="1.4" />
          <rect x="24" y="87" width="52" height="11" rx="3" fill="url(#gold)" stroke="#8a6218" strokeWidth="1.4" />
          <path d="M42 24l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1L42 24Z" fill="#fff8e6" opacity="0.85" />
        </svg>
      </div>

      <div className="intro-kicker">Award Ceremony</div>
      <h1 className="intro-title">{session?.title || 'Celebrating our stars'}</h1>
      {session?.tagline && <p className="intro-tagline">{session.tagline}</p>}

      {department && (
        <div className="turn-badge">
          <span
            className="pip"
            style={{ background: `hsl(${accent.hue} 78% 62%)` }}
          >
            {department.order_index + 1}
          </span>
          <span>
            <span className="lbl">Voting is now open for</span>
            <br />
            <span className="who">{department.name}</span>
          </span>
        </div>
      )}

      <p className="intro-status">Choose one person from each department. Your vote is anonymous.</p>

      <div className="intro-actions">
        <button className="btn btn-gold" onClick={finish}>
          {department ? 'Go to my ballot' : 'Enter'}
        </button>
      </div>
    </div>
  )
}
