import { api } from '../../../api/auth'

const p = (path, opts) => api(path, { _prefix: 'ucs', ...opts })

// ── QA bug tracker ─────────────────────────────────────────────────

export const getBugs = (params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
  const s = qs.toString()
  return p(`/bugs${s ? '?' + s : ''}`)
}

export const getBugStats = () => p('/bugs/stats')
export const getBugAssignees = () => p('/bugs/assignees')
export const getBug = (id) => p(`/bugs/${id}`)

export const createBug = (data) =>
  p('/bugs', { method: 'POST', body: JSON.stringify(data) })

export const updateBug = (id, data) =>
  p(`/bugs/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteBug = (id) =>
  p(`/bugs/${id}`, { method: 'DELETE' })

// Upload a screenshot (or any image) and return its public URL. Reuses the
// generic /api/upload endpoint the rest of the app stores media through.
export const uploadScreenshot = async (file) => {
  const form = new FormData()
  form.append('file', file)
  const res = await p('/upload', { method: 'POST', body: form })
  return res?.url || null
}
