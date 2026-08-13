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
}

export const PROJECT_OPTIONS = Object.values(PROJECTS).map((p) => ({
  value: p.id,
  label: p.label,
}))
