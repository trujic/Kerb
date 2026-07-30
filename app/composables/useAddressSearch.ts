// ── ADDRESS SEARCH ────────────────────────────────────────────────────────────
// "Koste Stojanovića 15" → where it is, and which zone parks there.
//
// The dashboard answers "where am I standing", which is useless the evening
// before, or when someone is telling you where to meet. This answers the same
// question about a place you are not at.
//
// Two honesty constraints carry over from the GPS path and one is new:
//   * the verdict comes from our traced geometry, which is not the sign — a
//     Belgrade audit puts it at 95% against the operator's own street list
//   * Belgrade splits zones BY HOUSE NUMBER (Palmotićeva 1-19 is one subzone,
//     21-33 another) and our polygons have no such granularity. A house number
//     therefore places the pin, not the price.

export interface AddressHit {
  label: string          // "Koste Stojanovića 15"
  detail: string         // "Stari grad · Beograd"
  lat: number
  lng: number
  cityId: string | null  // matched against the cities we cover
}

const CYR_LAT: Record<string, string> = {
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I',
  'Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R',
  'С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š',
  'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z','и':'i',
  'ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r',
  'с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c','ч':'č','џ':'dž','ш':'š',
}
const toLatin = (s: string) => s.split('').map((c) => CYR_LAT[c] ?? c).join('')

// Boxes wide enough to hold each city's metro area, so a search stays in the
// city the driver means — "Nemanjina" exists in Belgrade, Zrenjanin and Zemun.
const CITY_BOX: Record<string, [number, number, number, number]> = {
  'novi-sad':  [45.20, 19.75, 45.32, 19.95],
  'belgrade':  [44.70, 20.30, 44.90, 20.60],
  'nis':       [43.26, 21.83, 43.38, 21.99],
  'zrenjanin': [45.33, 20.34, 45.42, 20.45],
}

export const useAddressSearch = () => {
  const results = ref<AddressHit[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)
  let seq = 0

  const search = async (raw: string, cityId?: string | null) => {
    const q = raw.trim()
    results.value = []
    error.value = null
    if (q.length < 3) return

    const mine = ++seq
    pending.value = true
    try {
      const box = cityId ? CITY_BOX[cityId] : null
      const params = new URLSearchParams({
        q, format: 'json', limit: '6', addressdetails: '1',
        'accept-language': 'sr,en',
      })
      if (box) {
        // viewbox is left,top,right,bottom
        params.set('viewbox', `${box[1]},${box[2]},${box[3]},${box[0]}`)
        params.set('bounded', '1')
      } else {
        params.set('countrycodes', 'rs')
      }
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
      const raw2 = res.ok ? await res.json() : []
      if (mine !== seq) return // a newer keystroke already won

      results.value = (raw2 as any[]).map((h) => {
        const a = h.address ?? {}
        const road = a.road || a.pedestrian || a.footway || a.suburb || h.name
        const label = toLatin([road, a.house_number].filter(Boolean).join(' ') || h.display_name.split(',')[0])
        const detail = toLatin(
          [a.suburb, a.city || a.town || a.village || a.municipality].filter(Boolean).join(' · '),
        )
        const lat = Number(h.lat)
        const lng = Number(h.lon)
        return {
          label, detail, lat, lng,
          cityId: cityId ?? cityIdAt(lat, lng),
        }
      })
      if (!results.value.length) error.value = 'noAddressHit'
    } catch {
      if (mine === seq) error.value = 'addressSearchFailed'
    } finally {
      if (mine === seq) pending.value = false
    }
  }

  const clear = () => { results.value = []; error.value = null }
  return { results, pending, error, search, clear }
}

/** Which covered city a point falls in, or null when we do not cover it. */
export const cityIdAt = (lat: number, lng: number): string | null => {
  for (const [id, b] of Object.entries(CITY_BOX)) {
    if (lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3]) return id
  }
  return null
}

/**
 * The zone our traced geometry puts a point in, with how far the nearest paid
 * parking is. Mirrors the GPS resolver so a searched address and a standing
 * driver never get different answers about the same spot.
 */
export const zoneAtPoint = (
  lat: number,
  lng: number,
  geojson: any,
): { zone: string | null; distM: number; street: string | null } => {
  const M_LAT = 110_540
  const mLng = 111_320 * Math.cos((lat * Math.PI) / 180)
  const px = (x: number) => (x - lng) * mLng
  const py = (y: number) => (y - lat) * M_LAT

  const segDist = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(ax + t * dx, ay + t * dy)
  }
  const inRing = (ring: number[][]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = py(ring[i][1]), yj = py(ring[j][1])
      const xi = px(ring[i][0]), xj = px(ring[j][0])
      if ((yi > 0) !== (yj > 0) && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }

  let best: { d: number; zone: string; street: string | null } | null = null
  for (const f of geojson?.features ?? []) {
    const g = f.geometry
    const zone = f.properties?.zone
    if (!g || !zone) continue
    const street = f.properties?.name || null

    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
      for (const rings of polys) {
        if (rings[0] && inRing(rings[0]) && !rings.slice(1).some(inRing)) {
          return { zone, distM: 0, street }
        }
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) {
            const n = (i + 1) % ring.length
            const d = segDist(px(ring[i][0]), py(ring[i][1]), px(ring[n][0]), py(ring[n][1]))
            if (!best || d < best.d) best = { d, zone, street }
          }
        }
      }
      continue
    }
    const lines = g.type === 'LineString' ? [g.coordinates]
      : g.type === 'MultiLineString' ? g.coordinates : []
    for (const line of lines) {
      for (let i = 0; i + 1 < line.length; i++) {
        const d = segDist(px(line[i][0]), py(line[i][1]), px(line[i + 1][0]), py(line[i + 1][1]))
        if (!best || d < best.d) best = { d, zone, street }
      }
    }
  }
  return best
    ? { zone: best.d <= 30 ? best.zone : null, distM: best.d, street: best.street }
    : { zone: null, distM: Infinity, street: null }
}
