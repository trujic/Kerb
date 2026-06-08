// ── NEAREST PARKING ───────────────────────────────────────────────────────────
// Given the user's GPS point and the zone line geometry (public/zones/<city>.json),
// find the closest paid-parking segment: its distance in metres, zone, street, and
// the nearest point on it. Drives the "on / near / no paid parking" detection.
//
// Distances use a local equirectangular projection around the user — accurate to
// well under a metre at city scale, and far cheaper than haversine per vertex.

export interface NearestParking {
  distanceM: number
  zoneName: string
  streetName: string
  point: { lat: number; lng: number }
}

type Coords = { lat: number; lng: number; accuracy?: number } | null

const M_PER_DEG_LAT = 110_540
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

// Closest point on segment A→B to the origin (the user sits at 0,0 in local metres)
function closestOnSegment(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return { dist: Math.hypot(cx, cy), cx, cy }
}

export const useNearestParking = (
  coords: Ref<Coords> | (() => Coords),
  geojson: Ref<any> | (() => any),
) => {
  const nearest = computed<NearestParking | null>(() => {
    const c = toValue(coords)
    const g = toValue(geojson)
    if (!c || !g?.features?.length) return null

    const mLng = mPerDegLng(c.lat)
    // project [lng,lat] → local metres relative to the user
    const px = (lng: number) => (lng - c.lng) * mLng
    const py = (lat: number) => (lat - c.lat) * M_PER_DEG_LAT

    let best: { dist: number; cx: number; cy: number; zone: string; street: string } | null = null

    for (const f of g.features) {
      const geom = f.geometry
      if (!geom) continue
      const lines: number[][][] =
        geom.type === 'LineString' ? [geom.coordinates]
        : geom.type === 'MultiLineString' ? geom.coordinates
        : []
      const zone = f.properties?.zone ?? ''
      const street = f.properties?.name ?? ''

      for (const line of lines) {
        for (let i = 0; i + 1 < line.length; i++) {
          const ax = px(line[i][0]), ay = py(line[i][1])
          const bx = px(line[i + 1][0]), by = py(line[i + 1][1])
          const r = closestOnSegment(ax, ay, bx, by)
          if (!best || r.dist < best.dist) {
            best = { dist: r.dist, cx: r.cx, cy: r.cy, zone, street }
          }
        }
      }
    }

    if (!best) return null
    return {
      distanceM: best.dist,
      zoneName: best.zone,
      streetName: best.street,
      point: { lat: c.lat + best.cy / M_PER_DEG_LAT, lng: c.lng + best.cx / mLng },
    }
  })

  return { nearest }
}
