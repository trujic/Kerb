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

// Ray-cast: is the user (origin 0,0) inside this projected ring? (zone-area maps)
function originInRing(ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1], xi = ring[i][0], xj = ring[j][0]
    if ((yi > 0) !== (yj > 0) && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
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
      const zone = f.properties?.zone ?? ''
      const street = f.properties?.name ?? ''

      // Zone-area polygons (Niš areas, Novi Sad street networks): inside → distance 0;
      // else nearest edge. Rings beyond the first are HOLES (city blocks inside a
      // street network) — standing in one is outside, and its boundary counts.
      if (geom.type === 'Polygon') {
        const rings = (geom.coordinates ?? [])
          .map((r: number[][]) => r.map(([lng, lat]: number[]) => [px(lng), py(lat)]))
          .filter((r: number[][]) => r.length >= 3)
        if (!rings.length) continue
        const inHole = rings.slice(1).some((r: number[][]) => originInRing(r))
        if (originInRing(rings[0]) && !inHole) {
          if (!best || best.dist > 0) best = { dist: 0, cx: 0, cy: 0, zone, street }
          continue
        }
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) {
            const n = (i + 1) % ring.length
            const r = closestOnSegment(ring[i][0], ring[i][1], ring[n][0], ring[n][1])
            if (!best || r.dist < best.dist) best = { dist: r.dist, cx: r.cx, cy: r.cy, zone, street }
          }
        }
        continue
      }

      const lines: number[][][] =
        geom.type === 'LineString' ? [geom.coordinates]
        : geom.type === 'MultiLineString' ? geom.coordinates
        : []
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
