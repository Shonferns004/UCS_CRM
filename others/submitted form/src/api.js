// const API_BASE = 'https://api.beingsevak.org/api'
// VITE_API_URL lets a local run talk to the local backend (e.g. http://localhost:5000/api).
// Falls back to production when the env var is not set.
export const API_BASE = import.meta.env.VITE_API_URL || 'https://api.beingsevak.org/api'

const getToken = () => localStorage.getItem('ucs_token')

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) {
    // The 409 from upload-signature carries `can_resign`, which is the only
    // way the client learns it should offer "Update signature". Keep the status
    // and body on the error so that detail is not lost.
    const err = new Error(data.message || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  // `client` identifies the caller to the backend. It is what lets this app
  // authenticate a FRO with their own @ufs login, which every other surface
  // refuses. Do not send it from anywhere else.
  login: (identifier, password) => request('POST', 'auth/worker/login', { identifier, password, client: 'submitted_form' }),
  myProfile: () => request('GET', 'workers/me'),
  // Which document the volunteer handed over. Blank clears it. The backend
  // rejects anything outside the agreed option list.
  // Both columns together: the selection and the custom "Other" name, so
  // un-ticking Other cannot leave a stale name behind.
  saveDocumentsNeeded: (documentsValue, documentsOther = '') => request('PUT', 'workers/me', {
    documents_value: documentsValue,
    documents_other: documentsOther,
  }),
  uploadSignature: (signatureBase64, mimeType, meta = {}) => request('POST', 'onboarding/upload-signature', {
    signature_base64: signatureBase64,
    mime_type: mimeType,
    source: 'submitted_form',
    ...meta,
  }),
  commitSignature: (meta = {}) => request('POST', 'onboarding/signature/commit', { source: 'submitted_form', ...meta }),
  signature: () => request('GET', 'onboarding/signature'),
  policies: () => request('GET', 'onboarding/policies'),
}
