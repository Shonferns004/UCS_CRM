const PROJECT_ALIASES = [
  { project: 'bsct', aliases: ['bsct', 'being sevak'] },
  { project: 'aflf', aliases: ['aflf', 'ashray life'] },
  { project: 'mann', aliases: ['mann', 'mann care'] },
]

export function getWhatsAppProject(donor = {}) {
  const values = [donor.donor_project, donor.project, donor.ngo_name, ...(donor.ngo_names || [])]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase())

  for (const value of values) {
    const match = PROJECT_ALIASES.find(({ project, aliases }) => value === project || aliases.some(alias => value.includes(alias)))
    if (match) return match.project
  }

  return ''
}

// Resolve a donor's canonical project to the account the FRO actually holds.
// Each organisation ships two numbers (bsct/bsct2, aflf/aflf2, mann/mann 2);
// a donor whose canonical project is the base may need to open on the numbered
// number if that is the only one the FRO holds (and vice versa). Exact match
// is always preferred.
const PROJECT_FAMILIES = [
  ['bsct', 'bsct2'],
  ['aflf', 'aflf2'],
  ['mann', 'mann 2'],
]

export function resolveWhatsAppProject(canonical, held = []) {
  const c = String(canonical || '').trim().toLowerCase()
  const heldSet = (held || []).map(h => String(h || '').trim().toLowerCase()).filter(Boolean)
  if (!c) return ''
  if (!heldSet.length) return ''
  if (heldSet.includes(c)) return c
  for (const family of PROJECT_FAMILIES) {
    if (!family.includes(c)) continue
    const sibling = family.find(p => p !== c && heldSet.includes(p))
    if (sibling) return sibling
  }
  return ''
}

export function getWhatsAppChatUrl(donor) {
  const params = new URLSearchParams({ phone: donor?.donor_mobile || '' })
  const project = getWhatsAppProject(donor)
  if (project) params.set('project', project)
  return `/fro/whatsapp-chat?${params}`
}
