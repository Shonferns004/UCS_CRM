import api from './api'

export function getAll(params) {
  return api.get('/metro-lines', { params }).then(r => r.data)
}

export function getById(id) {
  return api.get(`/metro-lines/${id}`).then(r => r.data.data)
}

export function create(data) {
  return api.post('/metro-lines', data).then(r => r.data.data)
}

export function update(id, data) {
  return api.put(`/metro-lines/${id}`, data).then(r => r.data.data)
}

export function updateStatus(id, status) {
  return api.patch(`/metro-lines/${id}/status`, { status }).then(r => r.data.data)
}

export function remove(id) {
  return api.delete(`/metro-lines/${id}`).then(r => r.data.data)
}
