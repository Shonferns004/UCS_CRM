export { api as default } from '../../../api/auth'
export const apiGet = (path) => api(path, { _prefix: 'ucs' })
export const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body), _prefix: 'ucs' })
import { api } from '../../../api/auth'
