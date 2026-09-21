import api from './api.js'

export function getMonthly(params) {
  return api.get('/cash-collections', { params }).then(r => r.data.data)
}

export function create(payload) {
  return api.post('/cash-collections', payload).then(r => r.data.data)
}

export function remove(id) {
  return api.delete(`/cash-collections/${id}`).then(r => r.data.data)
}