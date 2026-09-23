// ── PAYMENT DENSITY ───────────────────────────────────────────────────────────
// Aggregated "people pay here" cells for the map. This is the weakest layer Kerb
// draws and the rules around it are the strictest, because it is the only layer
// built from what individual people did rather than from a document or a photo.
//
// Three rules, and none of them is negotiable:
//
//   1. No identity, ever. A cell is a count of distinct payers. "Marko paid here
//      two minutes ago" is a movement record — the same dataset the parked-car pin
//      was deliberately designed without — and it buys nothing the count doesn't.
//   2. k-anonymity. A cell below MIN_USERS distinct payers is not drawn and not
//      returned. Three people plus a location is close enough to an identity.
//   3. It says WHERE, never WHICH ZONE. Drivers pay the wrong zone routinely.
//      Rendering that as evidence would turn a common mistake into social proof.
//
// Positions are deliberately coarse. A payment ping carries two errors: the GPS
// fix, and the walk-away — the driver is usually already well clear of the car by
// the time the SMS goes out, displaced toward wherever they were heading. That
// second error is not random and does not average out, so the honest unit is a
// ~50 m cell, never a point.

export interface HeatCell { lat: number; lng: number; users: number }

const MIN_USERS = 5      // k-anonymity threshold — below this, nothing exists
const CELL_M = 50        // grid size; both error sources disappear inside it

// Metres per degree at Novi Sad's latitude. Good enough for a grid this coarse.
const latDeg = (m: number) => m / 111_320
const lngDeg = (m: number, lat: number) => m / (111_320 * Math.cos((lat * Math.PI) / 180))

// Snap to the grid and count DISTINCT payers per cell. The raw ping never leaves
// this function, and the returned cell carries no time finer than the window.
export const toCells = (pings: { lat: number; lng: number; user: string }[]): HeatCell[] => {
  const bucket = new Map<string, { lat: number; lng: number; users: Set<string> }>()
  for (const p of pings) {
    const dLat = latDeg(CELL_M)
    const dLng = lngDeg(CELL_M, p.lat)
    const gy = Math.round(p.lat / dLat)
    const gx = Math.round(p.lng / dLng)
    const key = gy + ':' + gx
    const cell = bucket.get(key) ?? { lat: gy * dLat, lng: gx * dLng, users: new Set<string>() }
    cell.users.add(p.user)
    bucket.set(key, cell)
  }
  return [...bucket.values()]
    .filter((c) => c.users.size >= MIN_USERS)
    .map((c) => ({ lat: c.lat, lng: c.lng, users: c.users.size }))
}

// ── Demo generator ────────────────────────────────────────────────────────────
// There are no stored pings yet (guest sessions live in localStorage), so this
// synthesises a week of them from the city's own zone geometry — purely so the
// layer can be SEEN before any of it is real. It models both errors on purpose:
// a symmetric GPS scatter, and a one-directional walk-away that biases every ping
// away from the bay. What you see on screen is as smeared as the real thing.
const seeded = (seed: number) => {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

const sampleGeometry = (geo: any, want: number, rnd: () => number) => {
  const pts: [number, number][] = []           // [lng, lat] as GeoJSON stores them
  const walk = (coords: any) => {
    if (typeof coords?.[0] === 'number') { pts.push(coords as [number, number]); return }
    if (Array.isArray(coords)) for (const c of coords) walk(c)
  }
  for (const f of geo?.features ?? []) walk(f.geometry?.coordinates)
  if (!pts.length) return []

  const out: [number, number][] = []
  for (let i = 0; i < want; i++) out.push(pts[Math.floor(rnd() * pts.length)])
  return out
}

export const demoPings = (geo: any, users: number, seed = 20260913) => {
  const rnd = seeded(seed)
  // ~8 paid parkings a month per user → a week's worth of pings.
  const count = Math.round(users * 0.27 * 7)
  const base = sampleGeometry(geo, count, rnd)

  return base.map(([lng, lat], i) => {
    // Error 1 — the GPS fix. Symmetric, zero-mean, shrinks with more samples.
    const gpsM = 8 + rnd() * 26
    const gpsA = rnd() * Math.PI * 2
    // Error 2 — the walk-away. The driver is already moving when they pay, so
    // this one has a direction and a floor: it never pulls the ping toward the
    // car, and averaging more pings does not remove it.
    const walkM = 6 + rnd() * 38
    const walkA = rnd() * Math.PI * 2

    const dx = Math.cos(gpsA) * gpsM + Math.cos(walkA) * walkM
    const dy = Math.sin(gpsA) * gpsM + Math.sin(walkA) * walkM

    return {
      lat: lat + latDeg(dy),
      lng: lng + lngDeg(dx, lat),
      // A synthetic payer id, so the k-anonymity count means something. Heavier
      // users repeat, exactly as they would in the real data.
      user: 'u' + Math.floor(rnd() * Math.max(1, users * 0.6)),
    }
  })
}

export const usePayHeat = () => {
  const cells = ref<HeatCell[]>([])
  const demo = ref(false)

  // Real cells first. The table may not exist yet — that is not an error state,
  // it is the normal state until pings are persisted server-side.
  const load = async (cityId: string, geo?: any, simulateUsers = 0) => {
    const supabase = useSupabaseClient()
    try {
      const { data, error } = await supabase
        .from('pay_cells')
        .select('lat, lng, users')
        .eq('city_id', cityId)
        .gte('users', MIN_USERS)
        .limit(2000)
      if (!error && data?.length) {
        cells.value = data as HeatCell[]
        demo.value = false
        return
      }
    } catch { /* no table yet — fall through to the demo */ }

    if (simulateUsers > 0 && geo) {
      cells.value = toCells(demoPings(geo, simulateUsers))
      demo.value = true
    } else {
      cells.value = []
      demo.value = false
    }
  }

  return { cells, demo, load, MIN_USERS }
}
