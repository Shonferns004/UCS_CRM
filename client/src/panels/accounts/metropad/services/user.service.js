import api from './api'

export function getAll(params) {
  return api.get('/users', { params }).then(r => r.data)
}

export function getById(id) {
  return api.get(`/users/${id}`).then(r => r.data.data)
}

export function create(data) {
  return api.post('/users', data).then(r => r.data.data)
}

export function update(id, data) {
  return api.put(`/users/${id}`, data).then(r => r.data.data)
}

export function resetPassword(id, data) {
  return api.patch(`/users/${id}/password`, data).then(r => r.data.data)
}

export function remove(id) {
  return api.delete(`/users/${id}`).then(r => r.data.data)
}