import api from './api'

export function getAll(params) {
  return api.get('/machines', { params }).then(r => r.data)
}

export function getById(id) {
  return api.get(`/machines/${id}`).then(r => r.data.data)
}

export function create(data) {
  return api.post('/machines', data).then(r => r.data.data)
}

export function update(id, data) {
  return api.put(`/machines/${id}`, data).then(r => r.data.data)
}

export function changeStatus(id, status, reason) {
  return api.patch(`/machines/${id}/status`, { status, reason }).then(r => r.data.data)
}

export function getStatusHistory(id, params = {}) {
  return api.get(`/machines/${id}/status-history`, { params }).then(r => r.data.data)
}

export function remove(id) {
  return api.delete(`/machines/${id}`).then(r => r.data.data)
}
