import api from './api'

export function getAll(params) {
  return api.get('/audit-logs', { params }).then(r => r.data)
}