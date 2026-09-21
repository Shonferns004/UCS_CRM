import axios from 'axios'

const METROPAD_API_URL = 'https://api.beingsevak.org/api/metropad'

const api = axios.create({
  baseURL: METROPAD_API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mpc_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mpc_token')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export default api
