import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '.sa-sidebar, .sidebar, .panel-side-aside, .sim-sidebar'
const OPEN_DELAY = 200

/**
 * Hover intent for the floating rail. Crossing the rail does nothing; the
 * 200ms dwell adds `.rail-hover`, which is what the CSS animates open. The pin
 * button uses `.rail-pinned`, so it still opens immediately.
 */
export default function SidebarHoverIntent() {
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 821px)')
    const attached = new WeakSet()
    const timers = new WeakMap()
    let frame = 0

    const attach = () => {
      document.querySelectorAll(SIDEBAR_SELECTOR).forEach((side) => {
        if (attached.has(side)) return
        attached.add(side)

        const enter = () => {
          if (!desktop.matches || side.classList.contains('rail-pinned')) return
          const current = timers.get(side)
          if (current) clearTimeout(current)
          timers.set(side, setTimeout(() => {
            timers.delete(side)
            side.classList.add('rail-hover')
          }, OPEN_DELAY))
        }

        const leave = () => {
          const current = timers.get(side)
          if (current) clearTimeout(current)
          timers.delete(side)
          side.classList.remove('rail-hover')
        }

        side.addEventListener('mouseenter', enter)
        side.addEventListener('mouseleave', leave)
      })
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        attach()
      })
    }

    attach()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      document.querySelectorAll(SIDEBAR_SELECTOR).forEach((side) => {
        const current = timers.get(side)
        if (current) clearTimeout(current)
        side.classList.remove('rail-hover')
      })
    }
  }, [])

  return null
}
