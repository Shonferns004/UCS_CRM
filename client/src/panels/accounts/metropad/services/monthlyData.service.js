import api from './api'

export function get(params) {
  return api.get('/monthly-data', { params }).then(r => r.data.data)
}

export function getRecords(params) {
  return api.get('/monthly-data/records', { params }).then(r => r.data.data)
}

export function create(payload) {
  return api.post('/monthly-data/records', payload).then(r => r.data.data)
}