// Which WhatsApp business number a donor conversation lives on.
//
// The NGO is fixed (Being Sevak, Ashray Life, Mann Care); the *number* is not.
// whatsapp_accounts carries two live Being Sevak rows -- `bsct` (id 4) and
// `bsct2` (id 6) -- and FROs are split across them, so a donor's NGO does not
// say which number their agent can actually reach them on. Both halves are
// needed: the donor record says who, the agent's own assignments say which
// number. Neither is guessed.

// Aliases deliberately include the second Being Sevak slug by substring, not as
// a separate entry: `'bsct2'.includes('bsct')` is true, so both numbers resolve
// to the one canonical organisation value `bsct` below. Which NUMBER to open is
// decided later, by what the agent is actually assigned.
const PROJECT_ALIASES = [
  { project: 'bsct', aliases: ['bsct', 'being sevak'] },
  { project: 'aflf', aliases: ['aflf', 'ashray life'] },
  { project: 'mann', aliases: ['mann', 'mann care'] },
]

// The two slugs Being Sevak is stored under. An agent holds one of them (or
// both); the deep link has to pick the one that is actually reachable.
const BEING_SEVAK_SLUGS = ['bsct', 'bsct2']

const matchProject = (value) => {
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return ''
  const entry = PROJECT_ALIASES.find(
    ({ project, aliases }) => normalized === project || aliases.some(alias => normalized.includes(alias)),
  )
  return entry ? entry.project : ''
}

/**
 * The donor's canonical NGO project.
 *
 * `donor_project` (donor_profiles.project_supported) is the authoritative field,
 * so it is consulted alone first. `ngo_name`/`ngo_names` are only a fallback for
 * the 125k+ donors with no project_supported at all, and when those disagree
 * with each other the donor is genuinely ambiguous -- so this returns '' rather
 * than picking whichever happened to be first in the array.
 */
export function getWhatsAppProject(donor = {}) {
  const authoritative = [donor.donor_project, donor.project]
    .map(matchProject)
    .find(Boolean)
  if (authoritative) return authoritative

  const fromNgos = new Set(
    [donor.ngo_name, ...(Array.isArray(donor.ngo_names) ? donor.ngo_names : [])]
      .map(matchProject)
      .filter(Boolean),
  )

  return fromNgos.size === 1 ? [...fromNgos][0] : ''
}

/**
 * Projects of the WhatsApp accounts this agent is assigned to.
 *
 * Read from the session list that /fro/whatsapp/auto-login already wrote to
 * localStorage (FROPanel.refreshWaUnread writes the same shape), so this is the
 * agent's own grants and nothing else. Empty when the agent has no accounts.
 */
export function getAuthorizedWaProjects() {
  try {
    const raw = localStorage.getItem('wa_agents')
    if (!raw) return []
    const agents = JSON.parse(raw)
    if (!Array.isArray(agents)) return []
    return [...new Set(agents.map(a => a?.project).filter(Boolean))]
  } catch {
    return []
  }
}

/**
 * Map a canonical donor project onto a slug this agent can actually use.
 *
 * Returns '' when nothing can be determined, which is the signal to leave the
 * `project` param off the deep link entirely: the inbox then opens unfiltered
 * and locates the donor by phone across every account the agent holds, instead
 * of pinning a number the donor may not be on.
 */
export function resolveWhatsAppProject(canonicalProject, authorizedProjects) {
  if (!canonicalProject) return ''

  const held = Array.isArray(authorizedProjects) ? authorizedProjects.filter(Boolean) : []
  if (held.includes(canonicalProject)) return canonicalProject

  if (BEING_SEVAK_SLUGS.includes(canonicalProject)) {
    const variants = held.filter(p => BEING_SEVAK_SLUGS.includes(p))
    // Exactly one Being Sevak number reachable -> that one, unambiguously.
    if (variants.length === 1) return variants[0]
    // Both held: the donor record cannot say which number they are on, so
    // don't guess. No held: the agent cannot reach Being Sevak at all.
  }

  return ''
}

export function getWhatsAppChatUrl(donor) {
  const params = new URLSearchParams({ phone: donor?.donor_mobile || '' })
  const project = resolveWhatsAppProject(getWhatsAppProject(donor), getAuthorizedWaProjects())
  if (project) params.set('project', project)
  return `/fro/whatsapp-chat?${params}`
}
