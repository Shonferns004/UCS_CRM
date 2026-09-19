import api from './api'

export function login(email, password) {
  return api.post('/auth/login', { email, password }).then(r => r.data.data)
}

export function getMe() {
  return api.get('/auth/me').then(r => r.data.data)
}
