import api from './api'

export function getAll(params) {
  return api.get('/stations', { params }).then(r => r.data)
}

export function getById(id) {
  return api.get(`/stations/${id}`).then(r => r.data.data)
}

export function create(data) {
  return api.post('/stations', data).then(r => r.data.data)
}

export function update(id, data) {
  return api.put(`/stations/${id}`, data).then(r => r.data.data)
}

export function remove(id) {
  return api.delete(`/stations/${id}`).then(r => r.data.data)
}
