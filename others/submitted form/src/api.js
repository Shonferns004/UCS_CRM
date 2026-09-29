const API_BASE = 'https://api.beingsevak.org/api'

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
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data
}

export const api = {
  login: (identifier, password) => request('POST', 'auth/worker/login', { identifier, password }),
  myProfile: () => request('GET', 'workers/me'),
  uploadSignature: (signatureBase64, mimeType) => request('POST', 'onboarding/upload-signature', { signature_base64: signatureBase64, mime_type: mimeType }),
}
