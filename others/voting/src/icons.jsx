/**
 * Icons for the voting booth.
 *
 * The booth is its own Vite app with its own package.json, so the CRM's icon
 * module in ../../client is not importable from here. These are local copies in
 * the same visual language (1.8px stroke, round caps, currentColor) so the booth
 * matches the wider product without taking on a dependency.
 */

function Icon(path) {
  return function IconComponent({ size = 20, ...rest }) {
    return (
      <svg
        {...rest}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {path}
      </svg>
    )
  }
}

export const ArrowRight = Icon(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>)
export const ArrowLeft = Icon(<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>)
export const Check = Icon(<polyline points="20 6 9 17 4 12" />)
export const Clock = Icon(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>)
export const Users = Icon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>)
export const Star = Icon(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />)
export const Grid = Icon(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>)
export const LogOut = Icon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>)
export const Brief = Icon(<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>)
export const Monitor = Icon(<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>)
export const Code = Icon(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>)
export const Brush = Icon(<><path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12 14.6l-3.6.9.9-3.6z" /><path d="M6 18c-1.5 0-3 1-3 2.5S4.5 23 6 23s2.5-1 2.5-2.5S7.5 18 6 18Z" /></>)
export const Shield = Icon(<><path d="M12 3l7 3v6c0 4.4-2.9 7.9-7 9-4.1-1.1-7-4.6-7-9V6l7-3Z" /><path d="M9.4 12.2l1.9 1.9 3.5-3.8" /></>)
export const Ballot = Icon(<><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9.5 12.5l1.8 1.8 3.4-3.6" /></>)
export const TrophyIcon = Icon(<><path d="M8 4h8v7a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5.5a2.5 2.5 0 0 0 2.5 4" /><path d="M16 6h2.5a2.5 2.5 0 0 1-2.5 4" /><line x1="12" y1="15" x2="12" y2="19" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="9" y1="19" x2="15" y2="19" /></>)
export const Lock = Icon(<><rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>)

/**
 * A simple line mark per department, chosen by name so the reference's six
 * departments each get their own glyph. Anything unrecognised falls back to a
 * neutral grid, so a department HR adds later still renders.
 */
const DEPT_ICON = {
  FRO: Brief,
  Digital: Monitor,
  Developers: Code,
  HR: Users,
  Admin: Grid,
  Housekeeping: Brush,
}

export function DepartmentIcon({ name, ...rest }) {
  const Cmp = DEPT_ICON[name] || Grid
  return <Cmp {...rest} />
}
