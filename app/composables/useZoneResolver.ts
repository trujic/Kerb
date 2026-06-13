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

function featureMinDist(geom: any, px: (n: number) => number, py: (n: number) => number): number {
  if (!geom) return Infinity
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
