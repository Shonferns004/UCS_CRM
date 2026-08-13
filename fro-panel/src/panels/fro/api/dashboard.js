import { api } from './auth'

export async function fetchDashboard() {
  return api('/dashboard/telecaller', { _prefix: 'ucs' })
}
