export const PROJECTS = {
  manncar: {
    id: 'manncar',
    label: 'Mann Care Foundation',
    shortLabel: 'Manncar',
    template: 'manncar',
  },
  ashray: {
    id: 'ashray',
    label: 'Ashray For Life Foundation',
    shortLabel: 'Ashray',
    template: 'ashray',
  },
  beingsevak: {
    id: 'beingsevak',
    label: 'Being Sevak Foundation',
    shortLabel: 'BeingSevak',
    template: 'beingsevak',
  },
  library: {
    id: 'library',
    label: 'Library',
    shortLabel: 'Library',
    template: 'library',
  },
  pg: {
    id: 'pg',
    label: 'PG',
    shortLabel: 'PG',
    template: 'pg',
  },
}

export const PROJECT_OPTIONS = Object.values(PROJECTS).map((p) => ({
  value: p.id,
  label: p.label,
}))
