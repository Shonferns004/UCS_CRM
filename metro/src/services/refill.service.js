import api from './api'

export function getAll(params) {
  const p = { ...params }
  if (p.month != null && p.year != null) {
    const month = Number(p.month)
    const year = Number(p.year)
    const date = new Date(year, month, 0)
    const lastDay = date.getDate()
    p.dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
    p.dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    delete p.month
    delete p.year
  }
  return api.get('/refills', { params: p }).then(r => r.data)
}

export function getRecent(limit = 10) {
  return api.get('/refills/recent', { params: { limit } }).then(r => r.data)
}

export function getByMachine(machineId, params) {
  return api.get(`/refills/machine/${machineId}`, { params }).then(r => r.data)
}

export function create(data) {
  return api.post('/refills', data).then(r => r.data.data)
}

export function update(id, data) {
  return api.put(`/refills/${id}`, data).then(r => r.data.data)
}

export function remove(id) {
  return api.delete(`/refills/${id}`).then(r => r.data.data)
}
