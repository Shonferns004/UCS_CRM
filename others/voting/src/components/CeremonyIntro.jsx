import { useEffect, useState } from 'react'
import trophyUrl from '../assets/images/transparent.png'

// The trophy composition (cup + star + laurel + pedestal) as a single
// transparent PNG. Used verbatim - never stretched, cropped or rebuilt from
// separate icons - so the aspect ratio below is the contract with the artwork.
const TROPHY_ASPECT = 1536 / 1024

// Deterministic pseudo-random from a seed, so the sparkle field is stable across
// re-renders instead of jumping every time the component re-mounts.
function seeded(i) {
  const x = Math.sin(i * 999.91) * 10000
  return x - Math.floor(x)
}

// Restrained on purpose: a few warm gold points low in the frame and a handful
// of dim white ones higher up. Enough to read as atmosphere, not as confetti.
const SPARKLES = Array.from({ length: 18 }, (_, i) => {
  const gold = i < 11
  return {
    left: `${5 + seeded(i) * 90}%`,
    top: `${8 + seeded(i + 50) * 74}%`,
    delay: `${(seeded(i + 100) * 7).toFixed(2)}s`,
    duration: `${(6 + seeded(i + 150) * 5).toFixed(2)}s`,
    size: gold ? 2 + seeded(i + 200) * 2 : 1.5 + seeded(i + 200) * 1.5,
    gold,
  }
})

const FEATURES = [
  { icon: 'mask', title: 'Anonymous Voting', sub: 'Your identity is safe' },
  { icon: 'ballot', title: 'One Vote Per Department', sub: 'Fair and transparent' },
  { icon: 'shield', title: 'Secure & Reliable', sub: 'Powered by UCS' },
]

/** Small gold outline marks for the feature row. Decorative only. */
function FeatureIcon({ name }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }
  if (name === 'mask') {
    return (
      <svg {...common}>
        <path d="M3 7c3-1.6 5-1.6 8 0 3-1.6 5-1.6 8 0v4c0 5-3.6 8-8 9-4.4-1-8-4-8-9V7Z" />
        <path d="M3.6 12.5c2.2 1 4 1 5.6.2M20.4 12.5c-2.2 1-4 1-5.6.2" />
      </svg>
    )
  }
  if (name === 'ballot') {
    return (
      <svg {...common}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4" />
        <path d="M9.5 12.5l1.8 1.8 3.4-3.6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v6c0 4.4-2.9 7.9-7 9-4.1-1.1-7-4.6-7-9V6l7-3Z" />
      <path d="M9.4 12.2l1.9 1.9 3.5-3.8" />
    </svg>
  )
}

/** Runs the ceremony and hands control back to the app when it is dismissed. */
export default function CeremonyIntro({ session, onDone }) {
  const [leaving, setLeaving] = useState(false)

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
    <div className={`intro${leaving ? ' leaving' : ''}`}   role="dialog" aria-modal="true" aria-label="Award ceremony">
      {/* ── top navigation ─────────────────────────────────────────────── */}
      <header className="intro-bar">
        <div className="intro-brand">
          <span className="intro-mark" aria-hidden="true">
            U
          </span>
          <span className="intro-names">
            <span className="intro-app-title">Award Ceremony Voting</span>
            <span className="intro-app-sub">Every vote is anonymous</span>
          </span>
        </div>
        <button className="intro-skip" onClick={finish}>
          Skip
        </button>
      </header>

      {/* ── hero ────────────────────────────────────────────────────────── */}
      <main className="intro-hero">
        {/* Decorative atmosphere: hidden from assistive tech, stilled under
            prefers-reduced-motion. */}
        <div className="spot left" aria-hidden="true" />
        <div className="spot right" aria-hidden="true" />
        <div className="corners" aria-hidden="true">
          <span className="corner left" />
          <span className="corner right" />
        </div>
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className={`spark${s.gold ? ' gold' : ''}`}
            aria-hidden="true"
            style={{
              left: s.left,
              top: s.top,
              animationDelay: s.delay,
              animationDuration: s.duration,
              width: s.size,
              height: s.size,
            }}
          />
        ))}

        <div className="intro-content">
          <div className="trophy">
            <div className="trophy-halo" aria-hidden="true" />
            <img
              src={trophyUrl}
              alt=""
              width="1536"
              height="1024"
              /* Reserves the box before the 1.7 MB PNG decodes, so nothing shifts. */
              style={{ aspectRatio: TROPHY_ASPECT }}
              fetchPriority="high"
              decoding="async"
              draggable="false"
            />
          </div>

          <p className="intro-eyebrow">Monthly</p>
          <h1 className="intro-title">
            Award <span className="gold-word">Ceremony</span>
          </h1>
          <p className="intro-copy">
            {session?.tagline || 'Recognising the people who made the difference this month.'}
          </p>

          <ul className="features">
            {FEATURES.map((f) => (
              <li key={f.title} className="feature">
                <span className="feature-icon">
                  <FeatureIcon name={f.icon} />
                </span>
                <span className="feature-title">{f.title}</span>
                <span className="feature-sub">{f.sub}</span>
              </li>
            ))}
          </ul>

          <div className="intro-actions">
            <button className="intro-enter" onClick={finish}>
              Enter
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M5 12h13M12.5 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
