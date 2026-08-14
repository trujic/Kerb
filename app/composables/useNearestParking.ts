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
  /**
   * This lot sells the zone's daily ticket. It is a property of the LOT, not the
   * zone: Novi Sad's Blue zone has a 95 RSD daily, but only nine of its 262
   * segments actually sell it, and the flag is drawn per polygon in the editor.
   * Carried here because the pay card is where it saves anyone money.
   */
  daily: boolean
}

/**
 * The closest segment OF EACH ZONE, nearest first.
 *
 * The single nearest segment answers "am I on a paid street". It cannot answer
 * "which zone am I in" at a corner, where two zones meet and the winner is
 * decided by a margin far smaller than any phone can measure — at Trg neznanog
 * junaka the two are 22.4 m and 22.3 m away, and picking the first was a coin
 * toss wearing a "likely yours" badge. Comparing the top two is the only way to
 * know that the question has no answer.
 */
export interface ZoneDistance {
  zoneName: string
  /** Distance to the zone's EDGE, unsigned — inside counts the same as outside. */
  edgeM: number
  /** Distance to the zone as a place to park: 0 anywhere inside it. */
  distanceM: number
  inside: boolean
  /** Line geometry has no inside — a street centreline, not an area. */
  line: boolean
  streetName: string
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
  // The geometry is walked once and answers both questions: which segment is
  // closest, and how close the closest segment of every zone is.
  const scan = computed<{ nearest: NearestParking | null; byZone: ZoneDistance[] }>(() => {
    const c = toValue(coords)
    const g = toValue(geojson)
    if (!c || !g?.features?.length) return { nearest: null, byZone: [] }

    const mLng = mPerDegLng(c.lat)
    // project [lng,lat] → local metres relative to the user
    const px = (lng: number) => (lng - c.lng) * mLng
    const py = (lat: number) => (lat - c.lat) * M_PER_DEG_LAT

    let best: { dist: number; cx: number; cy: number; zone: string; street: string; daily: boolean } | null = null
    // Two different distances, and conflating them is what made the app certain
    // right up to a line it cannot see:
    //
    //   dist — how far away the zone is as somewhere to park. Zero inside it.
    //   edge — how far the BOUNDARY is, unsigned. Five metres inside the edge and
    //          five metres outside it are the same amount of doubt, because a
    //          phone off by ten puts you on the other side either way.
    //
    // Only `dist` was measured before: stepping inside a polygon set it to 0 and
    // skipped the edge entirely, so the whole interior read as maximum confidence
    // — the middle of a block and half a metre from the line, identical.
    const perZone = new Map<string, { dist: number; edge: number; inside: boolean; line: boolean; street: string }>()
    const note = (zone: string, dist: number, edge: number, inside: boolean, line: boolean, street: string) => {
      const seen = perZone.get(zone)
      if (!seen) { perZone.set(zone, { dist, edge, inside, line, street }); return }
      if (dist < seen.dist) { seen.dist = dist; seen.street = street; seen.line = line }
      if (edge < seen.edge) seen.edge = edge
      seen.inside = seen.inside || inside
    }

    for (const f of g.features) {
      const geom = f.geometry
      if (!geom) continue
      const zone = f.properties?.zone ?? ''
      const street = f.properties?.name ?? ''
      const daily = f.properties?.daily === true

      // Zone-area polygons (Niš areas, Novi Sad street networks): inside → distance 0;
      // else nearest edge. Rings beyond the first are HOLES (city blocks inside a
      // street network) — standing in one is outside, and its boundary counts.
      // MultiPolygon is what operators publish — Thessaloniki's space-level export
      // is 1,957 of them. Unhandled, it fell through to the line branch below and
      // matched nothing: a whole city reading as "no paid parking", with no error
      // to notice. Each part is measured as its own polygon, holes included.
      const polys: number[][][][] =
        geom.type === 'MultiPolygon' ? (geom.coordinates ?? [])
        : geom.type === 'Polygon' ? [geom.coordinates ?? []]
        : []
      if (polys.length) {
        for (const poly of polys) {
          const rings = poly
            .map((r: number[][]) => r.map(([lng, lat]: number[]) => [px(lng), py(lat)]))
            .filter((r: number[][]) => r.length >= 3)
          if (!rings.length) continue
          const inHole = rings.slice(1).some((r: number[][]) => originInRing(r))
          const inside = originInRing(rings[0]) && !inHole
          if (inside && (!best || best.dist > 0)) best = { dist: 0, cx: 0, cy: 0, zone, street, daily }
          // The edge is measured either way now — being inside no longer excuses
          // us from knowing how close the line is.
          for (const ring of rings) {
            for (let i = 0; i < ring.length; i++) {
              const n = (i + 1) % ring.length
              const r = closestOnSegment(ring[i][0], ring[i][1], ring[n][0], ring[n][1])
              if (!inside && (!best || r.dist < best.dist)) best = { dist: r.dist, cx: r.cx, cy: r.cy, zone, street, daily }
              note(zone, inside ? 0 : r.dist, r.dist, inside, false, street)
            }
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
            best = { dist: r.dist, cx: r.cx, cy: r.cy, zone, street, daily }
          }
          note(zone, r.dist, r.dist, false, true, street)
        }
      }
    }

    const byZone: ZoneDistance[] = [...perZone.entries()]
      .map(([zoneName, v]) => ({
        zoneName, distanceM: v.dist, edgeM: v.edge, inside: v.inside, line: v.line,
        streetName: v.street,
      }))
      .sort((a, b) => a.distanceM - b.distanceM)

    if (!best) return { nearest: null, byZone }
    return {
      nearest: {
        distanceM: best.dist,
        zoneName: best.zone,
        streetName: best.street,
        daily: best.daily,
        point: { lat: c.lat + best.cy / M_PER_DEG_LAT, lng: c.lng + best.cx / mLng },
      },
      byZone,
    }
  })

  return {
    nearest: computed(() => scan.value.nearest),
    zoneDistances: computed(() => scan.value.byZone),
  }
}
