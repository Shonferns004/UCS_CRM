import { useEffect, useRef, useState } from 'react'

// Draws SVG connector lines between matched lead cards (left column) and their
// bank-audit entry cards (right column) inside the LeadAudit workspace. Pairs
// are discovered from data attributes on the cards themselves, so no extra
// props/data plumbing is needed:
//   lead card  → data-lead-log / data-match-entry / data-match-st / data-match-src
//   entry card → data-entry-id
// A dashed preview line is drawn for the current manual-match selection pair.
const LINE_PALETTE = [
  '#2563eb', '#dc2626', '#7c3aed', '#059669', '#d97706', '#0891b2',
  '#be185d', '#65a30d', '#c2410c', '#4f46e5', '#0d9488', '#9333ea',
]
const PREVIEW_COLOR = '#94a3b8'

export default function MatchLines({ containerRef, previewLogId = '', previewEntryId = '' }) {
  const [lines, setLines] = useState([])
  const rafRef = useRef(0)
  const deadlineRef = useRef(0)
  const delaysRef = useRef(new Map())

  useEffect(() => {
    const c = containerRef?.current
    if (!c) return

    const measure = () => {
      const cb = c.getBoundingClientRect()
      if (cb.width === 0 && cb.height === 0) return
      const entryById = new Map(
        [...c.querySelectorAll('[data-entry-id]')].map(el => [el.getAttribute('data-entry-id'), el])
      )
      const next = []
      let colorIdx = 0
      const addPair = (aEl, bEl, kind, key) => {
        const a = aEl.getBoundingClientRect()
        const b = bEl.getBoundingClientRect()
        const x1 = a.right - cb.left
        const y1 = a.top - cb.top + a.height / 2
        const x2 = b.left - cb.left
        const y2 = b.top - cb.top + b.height / 2
        if (x2 <= x1 + 8) return
        const top = Math.min(y1, y2)
        const bottom = Math.max(y1, y2)
        if (bottom < -80 || top > cb.height + 80) return
        const dx = Math.max(28, (x2 - x1) / 2)
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
        const color = kind === 'preview' ? PREVIEW_COLOR : LINE_PALETTE[colorIdx++ % LINE_PALETTE.length]
        if (!delaysRef.current.has(key)) delaysRef.current.set(key, (Math.random() * 2).toFixed(2))
        next.push({ key, d, color, dashed: kind === 'preview', x1, y1, x2, y2, delay: delaysRef.current.get(key) })
      }
      for (const le of c.querySelectorAll('[data-lead-log]')) {
        const eid = le.getAttribute('data-match-entry')
        if (!eid) continue
        const ee = entryById.get(eid)
        if (!ee) continue
        const st = le.getAttribute('data-match-st')
        const src = le.getAttribute('data-match-src')
        const kind = st === 'confirmed' ? 'confirmed' : src === 'manual' ? 'manual' : 'auto'
        addPair(le, ee, kind, 'm-' + eid)
      }
      if (previewLogId && previewEntryId) {
        const le = c.querySelector(`[data-lead-log="${previewLogId}"]`)
        const ee = entryById.get(String(previewEntryId))
        if (le && ee && !next.some(l => l.key === 'm-' + previewEntryId)) {
          addPair(le, ee, 'preview', 'preview')
        }
      }
      setLines(next)
    }

    const kick = (span = 380) => {
      deadlineRef.current = performance.now() + span
      if (rafRef.current) return
      const tick = () => {
        measure()
        rafRef.current = performance.now() < deadlineRef.current ? requestAnimationFrame(tick) : 0
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    kick()
    const onScroll = () => kick(140)
    const ro = new ResizeObserver(() => kick())
    ro.observe(c)
    const bindScrollers = () => {
      c.querySelectorAll('.entry-scroll').forEach(el => {
        if (!el.__mlBound) {
          el.__mlBound = true
          ro.observe(el)
          el.addEventListener('scroll', onScroll, { passive: true })
        }
      })
    }
    bindScrollers()
    const mo = new MutationObserver(() => { bindScrollers(); kick() })
    mo.observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', onScroll)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      ro.disconnect()
      mo.disconnect()
      c.querySelectorAll('.entry-scroll').forEach(el => {
        if (el.__mlBound) {
          el.__mlBound = false
          el.removeEventListener('scroll', onScroll)
        }
      })
      window.removeEventListener('resize', onScroll)
    }
  }, [containerRef, previewLogId, previewEntryId])

  if (lines.length === 0) return null

  // pathLength=100 normalises dash math so we never need the real arc length.
  // strokeDasharray="12 100" draws a 12% bright segment; strokeDashoffset
  // sweeps it from end→start→end in a smooth reverse loop.
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30, overflow: 'visible' }}>
      {lines.map(l => (
        <g key={l.key}>
          {/* Base track — dim solid color */}
          <path d={l.d} fill="none" stroke={l.color} strokeWidth={2}
            strokeDasharray={l.dashed ? '7 5' : undefined}
            strokeLinecap="round" opacity={l.dashed ? 0.85 : 0.35}
            pathLength={l.dashed ? undefined : 100} />

          {/* Shine sweep — bright white segment that travels back and forth */}
          {!l.dashed && (
            <path d={l.d} fill="none" stroke="#ffffff" strokeWidth={3}
              strokeLinecap="round" opacity={0.6}
              pathLength={100}
              strokeDasharray="12 100"
              strokeDashoffset="112">
              <animate
                attributeName="stroke-dashoffset"
                values="112;-12;112"
                dur="5s"
                repeatCount="indefinite"
                begin={`${l.delay}s`}
                calcMode="spline"
                keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
                keyTimes="0;0.5;1"
              />
            </path>
          )}

          {/* Start dot */}
          <circle cx={l.x1} cy={l.y1} r={3.5} fill="#fff" stroke={l.color} strokeWidth={2} />
          {/* End dot */}
          <circle cx={l.x2} cy={l.y2} r={3.5} fill={l.color} stroke="#fff" strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  )
}
