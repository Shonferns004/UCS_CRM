import api from './api'

export function getAll(params) {
  return api.get('/maintenance', { params }).then(r => r.data)
}

export function getById(id) {
  return api.get(`/maintenance/${id}`).then(r => r.data.data)
}

export function getByMachine(machineId, params) {
  return api.get(`/maintenance/machine/${machineId}`, { params }).then(r => r.data)
}

export function create(data) {
  return api.post('/maintenance', data).then(r => r.data.data)
}

export function update(id, data) {
  return api.put(`/maintenance/${id}`, data).then(r => r.data.data)
}
