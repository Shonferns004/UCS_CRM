const CACHE = 'ucs-v1'
const PRECACHE = ['/']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim())
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const isNav = request.mode === 'navigate'

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (isNav && res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {})
        }
        return res
      })
      .catch(() =>
        isNav
          ? caches.match(request).then((cached) => cached || caches.match('/'))
          : new Response(null, { status: 504 })
      )
  )
})
