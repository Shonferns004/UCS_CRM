import { useEffect, useRef, useState } from 'react'

// Draws SVG connector lines between matched lead cards (left column) and their
// bank-audit entry cards (right column) inside the LeadAudit workspace. Pairs
// are discovered from data attributes on the cards themselves, so no extra
// props/data plumbing is needed:
//   lead card  → data-lead-log / data-match-entry / data-match-st / data-match-src
//   entry card → data-entry-id
// A dashed preview line is drawn for the current manual-match selection pair.
const LINE_COLORS = {
  confirmed: '#16a34a',
  manual: '#d97706',
  auto: '#2563eb',
}

export default function MatchLines({ containerRef, previewLogId = '', previewEntryId = '' }) {
  const [lines, setLines] = useState([])
  const rafRef = useRef(0)
  const deadlineRef = useRef(0)

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
      const addPair = (aEl, bEl, kind, key) => {
        const a = aEl.getBoundingClientRect()
        const b = bEl.getBoundingClientRect()
        const x1 = a.right - cb.left
        const y1 = a.top - cb.top + a.height / 2
        const x2 = b.left - cb.left
        const y2 = b.top - cb.top + b.height / 2
        // Only draw left→right; skips stacked/narrow layouts and collapsed rows.
        if (x2 <= x1 + 8) return
        // Skip pairs fully outside the visible workspace band.
        const top = Math.min(y1, y2)
        const bottom = Math.max(y1, y2)
        if (bottom < -80 || top > cb.height + 80) return
        const dx = Math.max(28, (x2 - x1) / 2)
        next.push({
          key,
          d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
          color: LINE_COLORS[kind] || '#94a3b8',
          dashed: kind === 'preview',
          x1, y1, x2, y2,
        })
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

    // Re-measure every frame for a short window — covers scroll momentum,
    // the workspace width transition when a detail panel opens, etc.
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

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30, overflow: 'visible' }}>
      {lines.map(l => (
        <g key={l.key}>
          <path d={l.d} fill="none" stroke={l.color} strokeWidth={2}
            strokeDasharray={l.dashed ? '7 5' : undefined} strokeLinecap="round" opacity={0.85} />
          <circle cx={l.x1} cy={l.y1} r={3.5} fill="#fff" stroke={l.color} strokeWidth={2} />
          <circle cx={l.x2} cy={l.y2} r={3.5} fill={l.color} stroke="#fff" strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  )
}
