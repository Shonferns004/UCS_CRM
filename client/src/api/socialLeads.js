import { api } from './auth'

// Social Media panel → Leads Report (backend/routes/socialLeadsRoutes.js).
// Read-only: the Social team sees the leads its digital work brought in, without
// the ad-account management access that lives in the Accounts panel.
const call = (path, opts) => api(path, { _prefix: 'ucs', ...opts })

export const fetchSocialLeadsOverview = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== ''),
  ).toString()
  return call(`/social/leads/overview${qs ? `?${qs}` : ''}`)
}
