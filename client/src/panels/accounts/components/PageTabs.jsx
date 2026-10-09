import { useNavigate, useLocation } from 'react-router-dom'
import './pageTabs.css'

/* The tab strip used by every Accounts page that merged several sidebar entries
   into one page.

   Tabs navigate to REAL routes rather than flipping local state, which is the
   point: the browser back button moves between tabs the way a user expects, a
   refresh keeps you where you were, and a link pasted into chat opens the right
   tab. The tab bar only paints the switch.

   `exact` is for the tab whose route is the section's own index (/accounts/data
   rather than /accounts/data/old), since a prefix test would light up two tabs at
   once for the deeper route.
 */
export default function PageTabs({ tabs, ariaLabel = 'Sections', match }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isActive = (tab) => (match ? match(tab, pathname) : pathname === tab.path)

  return (
    <div className="page-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const active = isActive(t)
        return (
          <button
            key={t.path}
            type="button"
            role="tab"
            aria-selected={active}
            className={`page-tab${active ? ' is-on' : ''}`}
            onClick={() => navigate(t.path)}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}