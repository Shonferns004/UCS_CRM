const BASE = import.meta.env.VITE_API_URL || 'https://43-200-198-122.sslip.io/api'

async function request(path, options = {}) {
  const headers = { ...options.headers }
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout || 90000)
  try {
    const res = await fetch(`${BASE}${path}`, { ...options, headers, signal: controller.signal })
    const data = await res.json().catch(() => ({ message: res.statusText }))
    if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

export function generateQuiz(role, language) {
  return request('/quiz/generate', {
    method: 'POST',
    body: JSON.stringify({ role, language }),
  })
}

export function submitQuiz(payload) {
  return request('/quiz/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeout: 120000,
  })
}
