// ── OFFLINE ZONE CACHE ────────────────────────────────────────────────────────
// Keeps the last good copy of a city's zones and geometry, so the app can still
// name the zone with no network — and can say exactly how old that answer is.
//
// The dating is the point, not a nicety. Zones get corrected: Belgrade's purple
// polygon is wrong over fourteen streets as I write this, and the fix will be
// published live. A cached answer that cannot say when it was taken is a
// confident claim about a map that may have moved underneath it.
//
// IndexedDB rather than localStorage: Thessaloniki's geometry alone is 685 KB,
// and localStorage holds ~5 MB of strings across the whole origin.

export interface CachedCity {
  cityId: string
  geojson: any
  zones: any[]
  city: any | null
  /** When we last successfully read this from the network. */
  fetchedAt: number
  /** The operator-side revision, when the live row carries one. */
  updatedAt: string | null
}

const DB = 'kerb-offline'
const STORE = 'cities'

const idb = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'cityId' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

/**
 * IndexedDB stores by structured clone, which throws DataCloneError on a Proxy —
 * and everything reaching here has been through Vue's reactivity, so it is all
 * Proxies. The first version of this failed on every single write and said
 * nothing, because the catch below swallowed it: the database was created, the
 * store stayed empty, and offline silently did not work.
 */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const saveCity = async (rec: CachedCity): Promise<void> => {
  if (!import.meta.client || !('indexedDB' in window)) return
  try {
    const db = await idb()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(plain(rec))
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch (e) {
    // A full or blocked store must not break the online path — but it must not
    // disappear either, or the next person debugging this loses the same hour.
    if (import.meta.dev) console.warn('[Kerb] offline cache write failed:', e)
  }
}

export const loadCity = async (cityId: string): Promise<CachedCity | null> => {
  if (!import.meta.client || !('indexedDB' in window)) return null
  try {
    const db = await idb()
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const q = tx.objectStore(STORE).get(cityId)
      q.onsuccess = () => res(q.result ?? null)
      q.onerror = () => res(null)
    })
  } catch {
    return null
  }
}

/** Cities held offline, newest first — for "what will still work on the plane". */
export const listCached = async (): Promise<CachedCity[]> => {
  if (!import.meta.client || !('indexedDB' in window)) return []
  try {
    const db = await idb()
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const q = tx.objectStore(STORE).getAll()
      q.onsuccess = () => res((q.result ?? []).sort((a: any, b: any) => b.fetchedAt - a.fetchedAt))
      q.onerror = () => res([])
    })
  } catch {
    return []
  }
}

/**
 * Register the service worker for everyone, not only for people who turned on
 * notifications — offline is useless if the shell was never cached. Failing to
 * register is not an error worth surfacing; the app simply stays online-only.
 */
export const ensureServiceWorker = async (): Promise<void> => {
  if (!import.meta.client || !('serviceWorker' in navigator)) return
  try {
    const existing = await navigator.serviceWorker.getRegistration()
    if (!existing) await navigator.serviceWorker.register('/sw.js')
  } catch {
    /* private mode, unsupported, or blocked */
  }
}

/** Live online/offline flag — `navigator.onLine` alone lies often enough. */
export const useOnlineState = () => {
  const online = ref(true)
  if (import.meta.client) {
    online.value = navigator.onLine
    const up = () => (online.value = true)
    const down = () => (online.value = false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    onUnmounted(() => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    })
  }
  return { online }
}
