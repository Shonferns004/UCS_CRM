import { useMemo } from 'react'
import LocationSelect from '../../../components/LocationSelect'

// Activity dropdown for the event form.
//
// Shows every activity that already exists, grouped by its Sector, so anything
// added on a previous event is there to pick next time instead of having to be
// retyped. The typed text can still become a new activity — that keeps the
// existing "create on save" behaviour.
//
// An activity belongs to a sector, so picking one fills the Sector in as well.
// Otherwise the event could name an activity from a different sector, which the
// server rejects on save.
export default function ActivitySelect({
  value = '',
  onChange,            // (name, activity|null) => void — activity is null for a new name
  activities = [],
  sectors = [],
  ngoId = '',
  selectedSectorId = '',
  placeholder = 'Pick an activity or type a new one',
}) {
  const sectorName = useMemo(() => {
    const m = {}
    for (const s of sectors) m[String(s.id)] = s.name
    return (id) => m[String(id)] || 'Uncategorised'
  }, [sectors])

  // When an NGO is chosen, only offer that NGO's activities plus the ones shared
  // across all NGOs. An activity belonging to a different NGO would be rejected
  // on save, so offering it would only produce an error.
  const { groups, hiddenCount, byName } = useMemo(() => {
    const visible = activities.filter((a) => {
      if (!ngoId) return true
      return a.ngo_id == null || String(a.ngo_id) === String(ngoId)
    })
    const lookup = {}
    for (const a of visible) {
      const key = String(a.name || '').trim()
      if (!key) continue
      // Same name can exist under two sectors — prefer the one already chosen.
      const existing = lookup[key]
      if (!existing) lookup[key] = a
      else if (String(a.sector_id) === String(selectedSectorId) && String(existing.sector_id) !== String(selectedSectorId)) {
        lookup[key] = a
      }
    }
    const bySector = new Map()
    for (const a of visible) {
      const k = String(a.sector_id)
      if (!bySector.has(k)) bySector.set(k, new Set())
      const name = String(a.name || '').trim()
      if (name) bySector.get(k).add(name)
    }
    const list = [...bySector.entries()]
      .sort((x, y) => {
        // The sector already picked on the form comes first.
        if (x[0] === String(selectedSectorId)) return -1
        if (y[0] === String(selectedSectorId)) return 1
        return sectorName(x[0]).localeCompare(sectorName(y[0]))
      })
      .map(([sid, names]) => ({ label: sectorName(sid), options: [...names].sort((a, b) => a.localeCompare(b)) }))
    return { groups: list, hiddenCount: activities.length - visible.length, byName: lookup }
  }, [activities, ngoId, sectorName, selectedSectorId])

  const footer = !ngoId
    ? 'Pick an NGO to narrow this list down.'
    : hiddenCount > 0
      ? `${hiddenCount} activit${hiddenCount === 1 ? 'y belongs' : 'ies belong'} to another NGO and ${hiddenCount === 1 ? 'is' : 'are'} hidden.`
      : null

  return (
    <LocationSelect
      value={value}
      onChange={(name) => onChange?.(name, byName[name] || null)}
      onCreate={(typedName) => onChange?.(typedName, null)}
      groups={groups}
      placeholder={placeholder}
      ariaLabel="Activity"
      footer={footer}
    />
  )
}
