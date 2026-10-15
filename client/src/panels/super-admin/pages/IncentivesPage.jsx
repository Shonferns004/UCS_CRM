import { NavLink, Outlet } from 'react-router-dom'
import { Trophy, ChartBar, ChartLineUp } from '@phosphor-icons/react'

const TABS = [
  { to: 'sir', label: 'NGO wise Incentive', Icon: Trophy },
  { to: 'lead', label: 'Lead Incentive', Icon: ChartBar },
  // The old standalone "Incentive" page (Daily AKI slabs + rules) lives here now.
  { to: 'setup', label: 'Incentive Daily Chart', Icon: ChartLineUp },
]

// Merged "Incentives" page: NGO wise Incentive + Lead Incentive + the Daily
// AKI slab editor as tabs. Each tab keeps its own page, data logic and
// realtime behavior untouched.
export default function IncentivesPage() {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'inc-tab active' : 'inc-tab')}
            style={({ isActive }) => ({
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 999, textDecoration: 'none',
              border: '1px solid var(--line)',
              background: isActive ? 'var(--ink)' : 'var(--card-bg)',
              color: isActive ? '#fff' : 'var(--ink)',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            })}
          >
            <Icon size={15} weight="bold" />
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
