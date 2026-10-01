import trophyUrl from '../assets/images/transparent.png'
import CountdownPanel from './CountdownPanel'
import DepartmentCard from './DepartmentCard'
import { Lock } from '../icons'

// The award artwork as one transparent PNG (cup + star + laurel + pedestal).
// Used verbatim - never stretched, cropped or rebuilt from separate icons - so
// the aspect ratio below is the contract with the file.
const TROPHY_ASPECT = 1536 / 1024

/**
 * The department dashboard: every department, each with its own state.
 *
 * There is no running order and nobody waits — all the ballots are open for the
 * whole ceremony, so this is a menu, not a queue. After voting in one
 * department the booth drops you straight into the next one you have not voted
 * in yet, so the common case is tap, tap, tap.
 *
 * The department list, the voted flags and the countdown all come from the
 * ceremony payload; nothing about the count or the names is hardcoded here.
 */

/**
 * Deterministic pseudo-random from a seed, so the confetti field is identical on
 * every render instead of reshuffling each time the countdown ticks.
 */
function seeded(i) {
  const x = Math.sin(i * 999.91) * 10000
  return x - Math.floor(x)
}

const CONFETTI_COLORS = ['#e5ad32', '#c78e1e', '#078edb', '#6d35e8', '#07966b', '#f04452']

// Sixteen pieces is the whole budget: enough to read as a celebration at the
// edges of the page, few enough that nobody can see individual rectangles
// crossing the cards or the countdown.
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  left: `${(seeded(i + 3) * 100).toFixed(2)}%`,
  size: (4 + seeded(i + 40) * 6).toFixed(1),
  duration: (6 + seeded(i + 80) * 6).toFixed(2),
  delay: (-seeded(i + 120) * 12).toFixed(2),
  drift: ((seeded(i + 160) - 0.5) * 90).toFixed(0),
  spin: 320 + Math.round(seeded(i + 200) * 460),
  round: i % 3 === 0,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}))

/**
 * Falling confetti, decorative only: aria-hidden and pointer-events:none in CSS
 * so it can never take a tap meant for a department card, and switched off
 * entirely under prefers-reduced-motion.
 */
function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className={`confetti-piece${c.round ? ' is-round' : ''}`}
          style={{
            left: c.left,
            width: c.size,
            height: c.round ? c.size : c.size * 1.7,
            background: c.color,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            '--confetti-drift': `${c.drift}px`,
            '--confetti-spin': `${c.spin}deg`,
          }}
        />
      ))}
    </div>
  )
}

export default function DepartmentGrid({ ceremony, onVote }) {
  const { session, departments = [], closes_at: closesAt } = ceremony || {}

  const total = departments.length
  const done = departments.filter((d) => d.voted).length
  const allDone = total > 0 && done === total

  return (
    <div className="ceremony-page">
      <Confetti />

      <header className="ceremony-hero">
        <div className="ceremony-trophy">
          {/* One soft gold bloom behind the artwork: the celebratory beat the
              reference asks for, without a burst of DOM or a full second of
              motion before anyone can act. */}
          <span className="ceremony-trophy-glow" aria-hidden="true" />
          <img
            src={trophyUrl}
            alt=""
            width="1536"
            height="1024"
            /* Reserves the box before the PNG decodes, so the headline below it
               does not jump. */
            style={{ aspectRatio: TROPHY_ASPECT, objectFit: 'contain' }}
            fetchPriority="high"
            decoding="async"
            draggable="false"
          />
        </div>

        <p className="ceremony-eyebrow">{session?.award_label || 'Star of the Department'}</p>
        <h1 className="ceremony-title">{session?.title || 'Monthly Award Ceremony'}</h1>
        <p className="ceremony-sub">
          {allDone
            ? 'You have voted in every department. Thank you!'
            : 'Pick a department and vote for one person on their list. You can vote in every department.'}
        </p>
      </header>

      <CountdownPanel closesAt={closesAt} done={done} total={total} />

      <div className="dept-grid">
        {departments.map((d) => (
          <DepartmentCard key={d.id} department={d} onClick={onVote} interactive />
        ))}
      </div>

      <footer className="ceremony-note">
        <p className="ceremony-note-how">
          Tap <strong>Vote Now</strong>, pick one person, and confirm — your vote is recorded
          straight away and the next department opens on its own.
        </p>
        <p className="ceremony-note-private">
          <Lock size={15} aria-hidden="true" focusable="false" />
          Your vote is anonymous and cannot be changed.
        </p>
      </footer>
    </div>
  )
}
