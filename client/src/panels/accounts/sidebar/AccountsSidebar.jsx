import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, MoreHorizontal, Settings, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import ChatNavBadge from '../../../components/chat/ChatNavBadge'
import './accountsSidebar.css'

/* Storage keys. The group keys are the same ones the previous implementation
   used, so a user's already-chosen open/closed groups survive this rewrite. */
const COLLAPSED_KEY = 'accounts_nav_collapsed'
const GROUP_KEY_PREFIX = 'accounts_group_open_'

const MOBILE_QUERY = '(max-width:820px)'
const POPOVER_GAP = 8
const VIEWPORT_MARGIN = 10
const MIN_POPOVER_HEIGHT = 160

function readFlag(key) {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

function writeFlag(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch { /* storage unavailable */ }
}

/* Returns '1', '0', or null when nothing has been stored yet. Null has to stay
   distinguishable from '0': it is the only state that falls back to the group
   containing the current route. */
function readStoredFlag(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

function groupIsActive(group, pathname, isActive) {
  if (group.isGroupActive) return group.isGroupActive(pathname)
  return group.items.some((n) => isActive(n, pathname))
}

/* Tracks which groups are expanded. Multiple groups stay independently open, as
   before, and a group that owns the current route is forced open so its active
   child is never hidden. */
function useOpenGroups(groups, isActive) {
  const { pathname } = useLocation()

  const [openMap, setOpenMap] = useState(() => {
    const seed = {}
    for (const g of groups) {
      if (!g.items) continue
      const stored = readStoredFlag(GROUP_KEY_PREFIX + g.storageKey)
      seed[g.id] = stored === null ? groupIsActive(g, pathname, isActive) : stored === '1'
    }
    return seed
  })

  const groupsRef = useRef(groups)
  groupsRef.current = groups

  useEffect(() => {
    setOpenMap((prev) => {
      let changed = false
      const next = { ...prev }
      for (const g of groupsRef.current) {
        if (!g.items) continue
        if (next[g.id] !== true && groupIsActive(g, pathname, isActive)) {
          next[g.id] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pathname, isActive])

  const toggle = useCallback((group) => {
    setOpenMap((prev) => {
      const open = !prev[group.id]
      writeFlag(GROUP_KEY_PREFIX + group.storageKey, open)
      return { ...prev, [group.id]: open }
    })
  }, [])

  return [openMap, toggle]
}

/* Positioning and dismissal for every floating surface in the sidebar.
   Both the rail submenu and the header account menu are portalled out of the
   sidebar and anchored to a trigger, so they share one implementation.
   `anchor` is the trigger element itself, captured at the moment it was
   activated, rather than a ref read during render. */
function useAnchoredPopover({ open, anchor, onDismiss, placement = 'right' }) {
  const elRef = useRef(null)
  const [box, setBox] = useState(null)

  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setBox(null)
      return
    }

    let frame = 0

    const place = () => {
      const el = elRef.current
      if (!el) return

      const a = anchor.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const natural = el.scrollHeight
      const maxHeight = Math.min(natural, Math.max(vh - VIEWPORT_MARGIN * 2, 0))
      const height = Math.min(natural, maxHeight)

      let left
      let top

      if (placement === 'below') {
        left = Math.max(VIEWPORT_MARGIN, Math.min(a.right, vw - natural - VIEWPORT_MARGIN))
        const below = a.bottom + POPOVER_GAP
        const fitsBelow = below + height <= vh - VIEWPORT_MARGIN
        top = fitsBelow ? below : Math.max(VIEWPORT_MARGIN, a.top - POPOVER_GAP - height)
      } else {
        /* Anchor to the rail's right edge rather than the trigger's, so the
           popover sits at a consistent offset instead of tracking the icon. */
        const rail = anchor.closest('.sidebar')
        const railRight = rail ? rail.getBoundingClientRect().right : a.right
        left = railRight + POPOVER_GAP
        const maxLeft = vw - natural - VIEWPORT_MARGIN
        if (left > maxLeft) left = Math.max(VIEWPORT_MARGIN, maxLeft)

        /* Centred on the trigger, then pushed clear of it, then clamped. When
           neither side fits, the popover takes the roomier edge. */
        const minTop = a.bottom + POPOVER_GAP
        const maxTop = Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN)
        if (maxTop < Math.max(VIEWPORT_MARGIN, minTop)) {
          const above = a.top - POPOVER_GAP - height
          top = above >= VIEWPORT_MARGIN ? above : Math.min(maxTop, a.bottom + POPOVER_GAP)
        } else {
          top = Math.min(Math.max(a.top + a.height / 2 - height / 2, minTop), maxTop)
        }
        if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN
      }

      const next = { left: Math.round(left), top: Math.round(top), maxHeight, ready: true }
      setBox((prev) => (
        prev && prev.left === next.left && prev.top === next.top
          && prev.maxHeight === next.maxHeight && prev.ready === next.ready
          ? prev
          : next
      ))
    }

    /* Coalesced to one placement per frame: the scroll listener runs in the
       capture phase, so it also fires for the sidebar's own scroll and for every
       scrolling ancestor. */
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }

    schedule()
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)

    const onPointerDown = (e) => {
      if (elRef.current?.contains(e.target)) return
      if (anchor.contains(e.target)) return
      dismissRef.current()
    }
    const onKeyDown = (e) => { if (e.key === 'Escape') dismissRef.current() }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, anchor, placement])

  return [elRef, box]
}

function NavigationItem({ item, isActive, rail, onClose, openGroups, onToggleGroup, onOpenPopover, popoverGroupId, popoverId }) {
  const active = isActive(item)

  if (item.items) {
    const groupOpen = !!openGroups[item.id]
    const popoverOpen = popoverGroupId === item.id
    return (
      <div className="snav-group">
        <button
          type="button"
          className={`snav-item snav-group-header${active ? ' active' : ''}`}
          data-nav-id={item.id}
          aria-expanded={rail ? popoverOpen : groupOpen}
          aria-controls={rail ? popoverId : undefined}
          title={rail && !popoverOpen ? item.label : undefined}
          onClick={(e) => (rail ? onOpenPopover(item, e) : onToggleGroup(item))}
        >
          {item.icon && <span className="ico">{item.icon}</span>}
          <span className="sb-item-body">
            <span className="sb-item-label">{item.label}</span>
          </span>
          {!rail && (
            <span className={`snav-chevron${groupOpen ? ' open' : ''}`}>
              <ChevronRight size={14} />
            </span>
          )}
        </button>
        {!rail && (
          <div className={`snav-group-items${groupOpen ? '' : ' collapsed'}`}>
            {item.items.map((child) => (
              <NavigationItem
                key={child.id}
                item={child}
                sub
                isActive={isActive}
                onClose={onClose}
                openGroups={openGroups}
                onToggleGroup={onToggleGroup}
                onOpenPopover={onOpenPopover}
                popoverGroupId={popoverGroupId}
                popoverId={popoverId}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.path}
      className={`snav-item${item.sub ? ' snav-sub' : ''}${active ? ' active' : ''}`}
      data-nav-id={item.id}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      title={rail ? item.label : undefined}
    >
      {item.icon && <span className="ico">{item.icon}</span>}
      <span className="sb-item-body">
        <span className="sb-item-label">{item.label}</span>
        {item.id === 'chat' && <ChatNavBadge />}
      </span>
    </NavLink>
  )
}

export default function AccountsSidebar({ sections, isActive, open, onClose, account }) {
  const { pathname } = useLocation()
  const sidebarRef = useRef(null)
  const dotsRef = useRef(null)
  const popoverId = useId()
  const accountMenuId = useId()

  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY))
  const [popoverGroup, setPopoverGroup] = useState(null)
  const [popoverAnchor, setPopoverAnchor] = useState(null)
  const [accountOpen, setAccountOpen] = useState(false)

  const isMobile = useIsMobile()
  const rail = collapsed && !isMobile
  const [openGroups, onToggleGroup] = useOpenGroups(sections, isActive)

  const dismissPopover = useCallback(() => {
    setPopoverGroup(null)
    setPopoverAnchor(null)
  }, [])

  const [popoverElRef, popoverBox] = useAnchoredPopover({
    open: !!popoverGroup,
    anchor: popoverAnchor,
    onDismiss: dismissPopover,
  })
  const [accountElRef, accountBox] = useAnchoredPopover({
    open: accountOpen,
    anchor: dotsRef.current,
    onDismiss: useCallback(() => setAccountOpen(false), []),
    placement: 'below',
  })

  /* A route change, or collapsing out of the rail, closes whatever is
     floating. */
  useEffect(() => {
    dismissPopover()
    setAccountOpen(false)
  }, [pathname, dismissPopover])

  useEffect(() => { if (!rail) dismissPopover() }, [rail, dismissPopover])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      writeFlag(COLLAPSED_KEY, next)
      return next
    })
    dismissPopover()
  }

  /* Re-clicking the open group closes it, so the popover is dismissable by
     click as well as by Escape and outside click. */
  const openPopover = (group, event) => {
    if (popoverGroup?.id === group.id) {
      dismissPopover()
      return
    }
    setPopoverGroup(group)
    setPopoverAnchor(event.currentTarget)
  }

  const closeAndDismiss = () => {
    dismissPopover()
    if (onClose) onClose()
  }

  /* Portalled into the .panel-accounts root rather than document.body: that is
     where the panel's theme variables live, and the sidebar itself is
     overflow:visible (the nav scrolls inside it) so it would still clip a
     popover wider than the rail. */
  const portalTarget = sidebarRef.current?.closest('.panel-accounts') || document.body

  return (
    <>
      {open && <div className="sidebar-overlay open" onClick={onClose} />}
      <aside
        ref={sidebarRef}
        className={`sidebar${open ? ' open' : ''}${rail ? ' nav-collapsed' : ''}`}
      >
        <div className="sb-header">
          <div className="sb-mark" aria-hidden="true">UCS</div>
          <div className="sb-brand">
            <h1>UCS</h1>
            <span>Accounts Panel</span>
          </div>
          <button
            ref={dotsRef}
            type="button"
            className="sb-icon-btn"
            aria-label="Account options"
            aria-expanded={accountOpen}
            aria-controls={accountMenuId}
            onClick={() => setAccountOpen((v) => !v)}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        <button
          type="button"
          className="sb-collapse sb-icon-btn"
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!rail}
          onClick={toggleCollapsed}
        >
          {rail ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        <nav className="sidebar-nav" aria-label="Accounts navigation">
          {sections.map((section) => (
            <div key={section.id} role="group" aria-label={section.heading}>
              {section.heading && <div className="sb-section">{section.heading}</div>}
              {section.items.map((item) => (
                <NavigationItem
                  key={item.id}
                  item={item}
                  isActive={isActive}
                  rail={rail}
                  onClose={onClose}
                  openGroups={openGroups}
                  onToggleGroup={onToggleGroup}
                  onOpenPopover={openPopover}
                  popoverGroupId={popoverGroup?.id}
                  popoverId={popoverId}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {popoverGroup && createPortal(
        <nav
          ref={popoverElRef}
          id={popoverId}
          className={`ac-submenu${popoverBox?.ready ? ' ready' : ''}`}
          aria-label={`${popoverGroup.label} submenu`}
          style={{
            left: popoverBox?.left ?? 0,
            top: popoverBox?.top ?? 0,
            maxHeight: popoverBox?.maxHeight ?? MIN_POPOVER_HEIGHT,
          }}
        >
          {popoverGroup.items.map((child) => {
            const childActive = isActive(child, pathname)
            return (
              <NavLink
                key={child.id}
                to={child.path}
                className={`ac-submenu-item${childActive ? ' active' : ''}`}
                data-nav-id={child.id}
                aria-current={childActive ? 'page' : undefined}
                onClick={closeAndDismiss}
              >
                <span className="sb-item-label">{child.label}</span>
              </NavLink>
            )
          })}
        </nav>,
        portalTarget,
      )}

      {accountOpen && createPortal(
        <div
          ref={accountElRef}
          id={accountMenuId}
          className="ac-account-menu"
          style={{ left: accountBox?.left ?? 0, top: accountBox?.top ?? 0 }}
        >
          <div className="ac-account-head">
            <strong>{account.name}</strong>
            <span>Accounts</span>
          </div>
          <div className="ac-account-sep" />
          <button type="button" onClick={() => { setAccountOpen(false); account.onOpenSettings() }}>
            <Settings size={15} />
            Settings
          </button>
          <div className="ac-account-sep" />
          <button type="button" onClick={() => { setAccountOpen(false); account.onLogout() }}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>,
        portalTarget,
      )}
    </>
  )
}
