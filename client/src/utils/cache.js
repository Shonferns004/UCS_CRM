const store = new Map()

const DEFAULTS = {
  ttl: 30000,
}

export function cacheGet(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > entry.ttl) {
    store.delete(key)
    return null
  }
  return entry.data
}

export function cacheSet(key, data, ttl) {
  store.set(key, { data, ts: Date.now(), ttl: ttl || DEFAULTS.ttl })
}

export function cacheClear(pattern) {
  if (!pattern) { store.clear(); return }
  for (const k of store.keys()) {
    if (k.includes(pattern)) store.delete(k)
  }
}
