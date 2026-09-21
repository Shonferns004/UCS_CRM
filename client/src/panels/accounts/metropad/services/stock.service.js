import api from './api'

export function getConfig() {
  return api.get('/stock/config').then(r => r.data.data)
}

export function updateConfig(data) {
  return api.put('/stock/config', data).then(r => r.data.data)
}

export function getSummary() {
  return api.get('/stock/summary').then(r => r.data.data)
}

export function getStationWise() {
  return api.get('/stock/stations').then(r => r.data.data)
}

export function getMonthly(year, month) {
  return api.get('/stock/monthly', { params: { year, month } }).then(r => r.data.data)
}

export function getRemaining() {
  return api.get('/stock/remaining').then(r => r.data.data)
}

export function setMonthlyRefillStatus(data) {
  return api.post('/stock/monthly/status', data).then(r => r.data.data)
}

export function saveMonthlyRefill(machineId, data) {
  return api.put(`/stock/monthly/refill/${machineId}`, data).then(r => r.data.data)
}