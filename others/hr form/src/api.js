const API_BASE = import.meta.env.VITE_API_BASE || 'https://attendance-roan-zeta.vercel.app/api'

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
  submitOnboarding: (body) => request('POST', 'onboarding/submit', body),
  uploadPhoto: (photoBase64, mimeType) => request('POST', 'onboarding/upload-photo', { photo_base64: photoBase64, mime_type: mimeType }),
  uploadDocument: (documentType, fileBase64, mimeType) => request('POST', 'onboarding/upload-document', { document_type: documentType, file_base64: fileBase64, mime_type: mimeType }),
  uploadSignature: (signatureBase64, mimeType) => request('POST', 'onboarding/upload-signature', { signature_base64: signatureBase64, mime_type: mimeType }),
  policies: () => request('GET', 'onboarding/policies'),
  onboardingStatus: () => request('GET', 'onboarding/status'),
}
