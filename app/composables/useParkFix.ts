// ── WHERE THE CAR WAS ─────────────────────────────────────────────────────────
// The position recorded when someone pays is not the position of their car. They
// opened the app at the bay, then walked while reading, and the SMS goes out ten
// to fifty metres away — displaced toward wherever they were heading. That error
// has a direction, so unlike GPS scatter it does NOT average out no matter how
// many payments accumulate.
//
// The fix that is actually near the car is the one from when the app opened. But
// "the first fix" taken literally is wrong three ways, and each has a guard here:
//
//   1. The first fix is often the WORST. Before GPS locks, the browser answers
//      from wifi/cell triangulation — accuracy in the hundreds of metres. So we
//      take the earliest fix that is also good enough, not the earliest fix.
//   2. They may not have walked at all. Then there is no walk to undo, and the
//      most accurate fix beats the earliest one.
//   3. They may have DRIVEN between opening and paying — someone checks prices at
//      home, or looks up a zone while still circling for a space. A 400 m "walk"
//      in 90 seconds is a car. Then the opening fix is about a different place
//      entirely and must be discarded.
//
// What is stored is which rule fired (`source`) and how far they moved (`walkM`).
// Keeping that means a better estimator later can be run over the same history
// instead of inheriting whatever this one decided — the same reason `fixed_lat`
// never overwrites `lat`.

export interface Fix { lat: number; lng: number; accuracy: number; t: number }
export interface CarFix extends Fix {
  source: 'open' | 'still' | 'pay'  // which rule produced it
  walkM: number                     // measured distance between first and last fix
}

const FRESH_MS = 120_000   // older than this and the session is a different trip
const GOOD_ACC_M = 50      // a fix vaguer than this cannot anchor anything
const MOVED_M = 15         // below this they were standing still
const MAX_WALK_M = 150     // beyond this it was not a walk
const MAX_WALK_MS = 2.5    // m/s — above walking pace, they were in the car

// Session-scoped and shared: every caller sees the same trail, and it dies with
// the tab. Nothing here is persisted, and no fix leaves the device on its own.
const trail = ref<Fix[]>([])

const distM = (a: Fix, b: Fix) => {
  const R = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la = (a.lat * Math.PI) / 180
  const x = dLng * Math.cos(la)
  return Math.sqrt(dLat * dLat + x * x) * R
}

export const useParkFix = () => {
  // Call on every position update. Near-duplicate fixes are dropped so a watch
  // firing every second doesn't bury the one fix that matters.
  const record = (c: { lat: number; lng: number; accuracy?: number } | null) => {
    if (!c || c.lat == null || c.lng == null) return
    const fix: Fix = { lat: c.lat, lng: c.lng, accuracy: c.accuracy ?? 999, t: Date.now() }
    const last = trail.value.at(-1)
    if (last && distM(last, fix) < 3 && fix.t - last.t < 5_000) return
    trail.value = [...trail.value.slice(-59), fix]
  }

  const carFix = (): CarFix | null => {
    const now = Date.now()
    const all = trail.value
    const last = all.at(-1)
    if (!last) return null

    const recent = all.filter((f) => now - f.t <= FRESH_MS)
    const usable = recent.filter((f) => f.accuracy <= GOOD_ACC_M)
    const fallback = (): CarFix => ({ ...last, source: 'pay', walkM: 0 })
    if (!usable.length) return fallback()

    const first = usable[0]
    const newest = usable.at(-1)!
    const walkM = distM(first, newest)
    const dt = (newest.t - first.t) / 1000

    // Guard 3 — that was a drive, not a walk. The opening fix is another place.
    if (walkM > MAX_WALK_M) return fallback()
    if (dt > 0 && walkM / dt > MAX_WALK_MS) return fallback()

    // Guard 2 — they never moved, so take the sharpest fix rather than the oldest.
    if (walkM < MOVED_M) {
      const best = usable.reduce((a, b) => (b.accuracy < a.accuracy ? b : a))
      return { ...best, source: 'still', walkM }
    }

    // Guard 1 already applied by the accuracy filter: this is the earliest fix
    // that was worth trusting, which is the closest thing we have to the bay.
    return { ...first, source: 'open', walkM }
  }

  const reset = () => { trail.value = [] }

  return { record, carFix, reset, trail: readonly(trail) }
}
