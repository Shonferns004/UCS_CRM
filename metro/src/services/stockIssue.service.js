import api from './api'

export function getAll(params) {
  return api.get('/stock-issues', { params }).then(r => r.data)
}

export function getById(id) {
  return api.get(`/stock-issues/${id}`).then(r => r.data.data)
}

export function getByMachine(machineId, params) {
  return api.get(`/stock-issues/machine/${machineId}`, { params }).then(r => r.data)
}

export function create(data) {
  return api.post('/stock-issues', data).then(r => r.data.data)
}

export function updateStatus(id, status) {
  return api.patch(`/stock-issues/${id}/status`, { status }).then(r => r.data.data)
}
