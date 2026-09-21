import api from './api'

export function getStats(params) {
  return api.get('/dashboard/stats', { params }).then(r => r.data.data)
}

export function getLowStockAlerts(params) {
  return api.get('/dashboard/alerts/low-stock', { params }).then(r => r.data.data)
}

export function getAttentionMachines(params) {
  return api.get('/dashboard/alerts/attention', { params }).then(r => r.data.data)
}

export function getRecentRefills(limit = 10) {
  return api.get('/dashboard/recent-refills', { params: { limit } }).then(r => r.data.data)
}

export function getOverview(params) {
  return api.get('/dashboard/overview', { params }).then(r => r.data.data)
}
