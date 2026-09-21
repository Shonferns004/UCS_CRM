import api from './api'

export function validate(file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/import/validate', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data.data)
}

export function confirm(rows) {
  return api.post('/import/confirm', { rows }).then(r => r.data.data)
}
