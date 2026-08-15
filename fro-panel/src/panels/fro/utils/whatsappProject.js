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

export function getWhatsAppChatUrl(donor) {
  const params = new URLSearchParams({ phone: donor?.donor_mobile || '' })
  const project = getWhatsAppProject(donor)
  if (project) params.set('project', project)
  return `/fro/whatsapp-chat?${params}`
}
