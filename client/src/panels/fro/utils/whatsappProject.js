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
// Being Sevak ships two numbers (bsct, bsct2); a donor whose canonical project
// is `bsct` may need to open on `bsct2` if that is the only one the FRO holds
// (and vice versa). Other organisations resolve by exact match only.
export function resolveWhatsAppProject(canonical, held = []) {
  const c = String(canonical || '').trim().toLowerCase()
  const heldSet = (held || []).map(h => String(h || '').trim().toLowerCase()).filter(Boolean)
  if (!c) return ''
  if (!heldSet.length) return ''
  // Being Sevak family: bridge between bsct and bsct2.
  const isBsctFamily = c === 'bsct' || c === 'bsct2'
  if (isBsctFamily) {
    const bsctHeld = heldSet.includes('bsct')
    const bsct2Held = heldSet.includes('bsct2')
    if (heldSet.includes(c)) return c  // exact match preferred
    if (c === 'bsct' && bsct2Held && !bsctHeld) return 'bsct2'
    if (c === 'bsct2' && bsctHeld && !bsct2Held) return 'bsct'
    // held both or neither exact → prefer exact if held, else first bsct-family held
    if (bsctHeld) return 'bsct'
    if (bsct2Held) return 'bsct2'
  }
  // Other organisations: exact match only.
  if (heldSet.includes(c)) return c
  return ''
}

export function getWhatsAppChatUrl(donor) {
  const params = new URLSearchParams({ phone: donor?.donor_mobile || '' })
  const project = getWhatsAppProject(donor)
  if (project) params.set('project', project)
  return `/fro/whatsapp-chat?${params}`
}
