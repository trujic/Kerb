// ── ZONE RESOLVER ("ASK AI FOR HELP") ─────────────────────────────────────────
// Deterministic candidate-set resolver. The LLM is never asked to *remember* zones
// (that's a fine waiting to happen); geometry + the official registry decide, and
// the verdict ALWAYS carries its evidence. Four honest states:
//
//   assert        — one zone, comfortably clear of any boundary (HIGH CONFIDENCE)
//   triangulated  — assert + a verified sign nearby agrees (GPS + registry + scan)
//   disambiguate  — candidates disagree; resolve by asking which street
//   route_to_sign — too close to call / a verified sign is right there → trust it
//   none          — no paid segment within the GPS error circle (likely free)

export interface ResolverCandidate {
  street: string
  zone: string
  color: string
  distM: number
  segmented: boolean // this street changes zone near here
}

export interface ResolverSign {
  distM: number
  bearing: number
  zoneName: string
  color: string | null
  agrees: boolean
  createdAt: string
}

export interface ZoneVerdict {
  state: 'assert' | 'triangulated' | 'disambiguate' | 'route_to_sign' | 'none'
  zone?: { name: string; color: string }
  candidates?: ResolverCandidate[]
  sign?: ResolverSign | null
  accuracyM: number
  boundaryDistM?: number | null
  signCount?: number                       // confirmed scans backing this verdict
  override?: { mapZone: string } | null    // the map said this, the sign overruled it
}

type Coords = { lat: number; lng: number; accuracy?: number } | null

const M_PER_DEG_LAT = 110_540
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

function segDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

// Ray-cast: is the query point (the origin, 0,0) inside this projected ring?
function originInRing(ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1], xi = ring[i][0], xj = ring[j][0]
    if ((yi > 0) !== (yj > 0) && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Distance from the user (origin) to a feature — 0 if standing inside a zone area.
// Polygon rings beyond the first are HOLES (city blocks enclosed by a street
// network): standing in a hole is NOT inside, and its boundary counts for distance.
function featureMinDist(geom: any, px: (n: number) => number, py: (n: number) => number): number {
  if (!geom) return Infinity
  if (geom.type === 'Polygon') {
    const rings = (geom.coordinates ?? [])
      .map((r: number[][]) => r.map((c: number[]) => [px(c[0]), py(c[1])]))
      .filter((r: number[][]) => r.length >= 3)
    if (!rings.length) return Infinity
    const inHole = rings.slice(1).some((r: number[][]) => originInRing(r))
    if (originInRing(rings[0]) && !inHole) return 0
    let min = Infinity
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const n = (i + 1) % ring.length
        const d = segDist(ring[i][0], ring[i][1], ring[n][0], ring[n][1])
        if (d < min) min = d
      }
    }
    return min
  }
  const lines: number[][][] =
    geom.type === 'LineString' ? [geom.coordinates]
    : geom.type === 'MultiLineString' ? geom.coordinates : []
  let min = Infinity
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const d = segDist(px(line[i][0]), py(line[i][1]), px(line[i + 1][0]), py(line[i + 1][1]))
      if (d < min) min = d
    }
  }
  return min
}

const toRad = (d: number) => (d * Math.PI) / 180
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

const ASSERT_CLEARANCE = 80 // m to the nearest differing-zone boundary for HIGH CONFIDENCE
const TRIANGULATE_M = 25    // a verified sign this close that agrees → triangulated
const SIGN_ROUTE_M = 40     // a verified sign this close on a tie → trust the sign
const SIGN_PRIMARY_M = 35   // a confirmed sign within this radius is authoritative

export const useZoneResolver = (
  coords: Ref<Coords> | (() => Coords),
  geojson: Ref<any> | (() => any),
  signReports: Ref<any[]> | (() => any[]),
) => {
  const verdict = computed<ZoneVerdict | null>(() => {
    const c = toValue(coords)
    const g = toValue(geojson)
    if (!c || !g?.features?.length) return null

    const mLng = mPerDegLng(c.lat)
    const px = (lng: number) => (lng - c.lng) * mLng
    const py = (lat: number) => (lat - c.lat) * M_PER_DEG_LAT
    const acc = c.accuracy ?? 30
    const R = Math.min(Math.max(acc, 20), 120) + 15 // error circle + margin

    const feats = g.features.map((f: any) => ({
      street: f.properties?.name ?? '',
      zone: f.properties?.zone ?? '',
      color: (f.properties?.color ?? '#8A93A1').trim(),
      dist: featureMinDist(f.geometry, px, py),
    })).filter((f: any) => f.zone)

    const candidates = feats.filter((f: any) => f.dist <= R)

    // Nearest verified sign (for triangulation / route-to-sign)
    const signs = (toValue(signReports) ?? [])
      .filter((s: any) => s.lat != null && s.lng != null)
      .map((s: any) => ({ s, dist: haversineM(c, { lat: s.lat, lng: s.lng }) }))
      .sort((a: any, b: any) => a.dist - b.dist)
    const near = signs[0]
    const buildSign = (agrees: boolean): ResolverSign | null => near ? {
      distM: near.dist,
      bearing: bearingDeg(c, { lat: near.s.lat, lng: near.s.lng }),
      zoneName: near.s.zone_name,
      color: near.s.zone_color ?? null,
      agrees,
      createdAt: near.s.created_at,
    } : null

    // ── SIGN-FIRST ─────────────────────────────────────────────────────────────
    // Confirmed signs are ground truth and OUTRANK the map geometry (which we know
    // carries mismatches). If any are right here, they decide — even against the map.
    const signsNear = signs.filter((x: any) => x.dist <= SIGN_PRIMARY_M)
    if (signsNear.length) {
      const counts: Record<string, number> = {}
      for (const x of signsNear) counts[x.s.zone_name] = (counts[x.s.zone_name] ?? 0) + 1
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
      const [topZone, topN] = ranked[0]
      const agree = ranked.length === 1 || topN >= Math.ceil(signsNear.length * 0.6)

      if (agree) {
        const sZone = signsNear.find((x: any) => x.s.zone_name === topZone)!.s
        const geomNearest = feats.length ? feats.reduce((a: any, b: any) => (a.dist < b.dist ? a : b)) : null
        const mapZone = geomNearest && geomNearest.dist <= R ? geomNearest.zone : null
        return {
          state: mapZone === topZone ? 'triangulated' : 'assert',
          zone: { name: topZone, color: sZone.zone_color ?? '#8A93A1' },
          accuracyM: acc,
          boundaryDistM: null,
          signCount: topN,
          sign: buildSign(true),
          override: mapZone && mapZone !== topZone ? { mapZone } : null,
        }
      }
      // Nearby signs disagree with each other → trust the one beside the car.
      return { state: 'route_to_sign', accuracyM: acc, sign: buildSign(false) }
    }

    if (!candidates.length) {
      return { state: 'none', accuracyM: acc, sign: near && near.dist <= 150 ? buildSign(false) : null }
    }

    const zones: string[] = [...new Set(candidates.map((c2: any) => c2.zone))]

    // ── Single consensus zone ──
    if (zones.length === 1) {
      const consensus = zones[0]
      const consensusColor = candidates[0].color
      const diff = feats.filter((f: any) => f.zone !== consensus)
      const boundaryDistM = diff.length ? Math.min(...diff.map((f: any) => f.dist)) : null

      if (boundaryDistM === null || boundaryDistM > ASSERT_CLEARANCE) {
        const signAgrees = !!near && near.dist <= TRIANGULATE_M && near.s.zone_name === consensus
        return {
          state: signAgrees ? 'triangulated' : 'assert',
          zone: { name: consensus, color: consensusColor },
          accuracyM: acc,
          boundaryDistM,
          sign: signAgrees ? buildSign(true) : null,
        }
      }
      // single zone but a boundary is close → too close to call
      return {
        state: 'route_to_sign',
        zone: { name: consensus, color: consensusColor },
        accuracyM: acc,
        boundaryDistM,
        sign: near && near.dist <= 150 ? buildSign(near.s.zone_name === consensus) : null,
      }
    }

    // ── Candidates disagree ──
    // A verified sign right here outranks any guess — trust the physical sign.
    if (near && near.dist <= SIGN_ROUTE_M) {
      return { state: 'route_to_sign', accuracyM: acc, sign: buildSign(false) }
    }

    // Otherwise: ask which street. Dedupe to (street,zone), nearest first, and flag
    // streets that carry more than one zone near here (internally segmented).
    const seen = new Set<string>()
    const options: ResolverCandidate[] = []
    for (const cand of [...candidates].sort((a: any, b: any) => a.dist - b.dist)) {
      const key = `${cand.street}|${cand.zone}`
      if (seen.has(key)) continue
      seen.add(key)
      options.push({ street: cand.street, zone: cand.zone, color: cand.color, distM: cand.dist, segmented: false })
    }
    const zonesByStreet: Record<string, Set<string>> = {}
    for (const o of options) (zonesByStreet[o.street] ??= new Set()).add(o.zone)
    for (const o of options) o.segmented = zonesByStreet[o.street].size > 1

    return {
      state: 'disambiguate',
      candidates: options.slice(0, 6),
      accuracyM: acc,
      sign: near && near.dist <= 150 ? buildSign(false) : null,
    }
  })

  return { verdict }
}

// ── SELF-HEALING MAP ──────────────────────────────────────────────────────────
// Non-destructive: returns a copy of the geometry where any segment that confirmed
// signs disagree with is recoloured to the sign's zone. The source file is never
// edited — the sign just wins at render time. Display bar is conservative (≥2 scans)
// so one stray scan can't recolour the public map; the resolver trusts a single
// nearby sign for the person actually standing there.
export function applySignOverrides(
  geojson: any,
  signReports: any[],
  opts: { radiusM?: number; minScans?: number } = {},
): any {
  const radiusM = opts.radiusM ?? 25
  const minScans = opts.minScans ?? 2
  if (!geojson?.features?.length || !signReports?.length) return geojson

  const out = {
    ...geojson,
    features: geojson.features.map((f: any) => ({ ...f, properties: { ...f.properties } })),
  }

  for (const f of out.features) {
    const counts: Record<string, { n: number; color: string | null }> = {}
    for (const s of signReports) {
      if (s.lat == null || s.lng == null) continue
      const mLng = mPerDegLng(s.lat)
      const px = (lng: number) => (lng - s.lng) * mLng
      const py = (lat: number) => (lat - s.lat) * M_PER_DEG_LAT
      if (featureMinDist(f.geometry, px, py) > radiusM) continue
      const z = s.zone_name
      if (!z) continue
      ;(counts[z] ??= { n: 0, color: s.zone_color ?? null }).n++
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1].n - a[1].n)
    if (!ranked.length) continue
    const [topZone, info] = ranked[0]
    if (info.n >= minScans && topZone !== f.properties?.zone) {
      f.properties.zone = topZone
      if (info.color) f.properties.color = info.color
      f.properties.name = f.properties?.name ? `${f.properties.name} ✓` : '✓ sign-confirmed'
      f.properties.overridden = true
    }
  }
  return out
}
