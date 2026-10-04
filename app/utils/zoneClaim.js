// ── TWO CLAIMS, NOT ONE ───────────────────────────────────────────────────────
// The app used to say one hedged sentence — "probably Blue, check the sign" —
// and say it identically whether it had one source or four. A caveat that never
// moves carries no information: drivers stop reading it, and when a real warning
// finally appears they miss it.
//
// The fix is to notice that two different things were being hedged together:
//
//   PLACE — "this block is the Blue zone". Built from the registry, scanned
//           signs, and where people pay. Every one of those gets STRONGER with
//           more users, so this claim is allowed to be confident, and its
//           confidence is allowed to grow.
//
//   YOU   — "you are standing in it". Built from GPS alone, which never improves
//           no matter how many users arrive. This claim stays uncertain forever.
//
// So the rules go in plain language and the hedge attaches only to the second —
// and its loudness is computed, not constant: it depends on how much room there
// is between the GPS error and the nearest DIFFERENT zone. Deep inside a zone the
// warning is nearly pointless and goes quiet; near a boundary it gets loud and
// names the specific neighbour, which is information rather than wallpaper.
//
// Pure functions, no framework imports, so the same code runs in the app and in
// scripts/test-zone-claim.mjs.

const R = 6_371_000

/** Local metres-per-degree, good to well under a metre at city scale. */
function scale(lat) {
  const rad = (lat * Math.PI) / 180
  return { mPerLat: (Math.PI / 180) * R, mPerLng: (Math.PI / 180) * R * Math.cos(rad) }
}

/** Distance in metres from p to the segment ab, all in [lng, lat]. */
function distToSegment(p, a, b, s) {
  const px = (p[0] - a[0]) * s.mPerLng, py = (p[1] - a[1]) * s.mPerLat
  const bx = (b[0] - a[0]) * s.mPerLng, by = (b[1] - a[1]) * s.mPerLat
  const len2 = bx * bx + by * by
  if (len2 === 0) return Math.hypot(px, py)
  let t = (px * bx + py * by) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - bx * t, py - by * t)
}

/** Ray casting on a single ring of [lng, lat] pairs. */
function inRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * For one Polygon feature: is the point inside (ring 0 minus any holes), and how
 * far is it from the boundary? Holes matter here — Novi Sad's lot polygons carry
 * city blocks as inner rings, and a point in a courtyard is NOT in the zone.
 */
function measure(p, coords, s) {
  const outer = coords[0]
  let edge = Infinity
  for (const ring of coords) {
    for (let i = 0; i < ring.length - 1; i++) {
      const d = distToSegment(p, ring[i], ring[i + 1], s)
      if (d < edge) edge = d
    }
  }
  let inside = inRing(p, outer)
  if (inside) for (let i = 1; i < coords.length; i++) if (inRing(p, coords[i])) { inside = false; break }
  return { inside, edge }
}

/**
 * Every zone ranked by distance: 0 when the point is inside it, otherwise the
 * distance to its nearest edge. `edge` is always the distance to the boundary,
 * which is what the hedge needs — being 90 m inside is a different situation
 * from being 3 m inside, and today both said the same thing.
 */
export function rankZones(point, geo) {
  const s = scale(point[1])
  const best = new Map()
  for (const f of geo?.features ?? []) {
    if (f.geometry?.type !== 'Polygon') continue
    const zone = f.properties?.zone
    if (!zone) continue
    const { inside, edge } = measure(point, f.geometry.coordinates, s)
    const dist = inside ? 0 : edge
    const prev = best.get(zone)
    if (!prev || dist < prev.dist || (dist === prev.dist && edge < prev.edge)) {
      best.set(zone, {
        zone,
        dist,
        edge,
        inside,
        color: f.properties?.color ?? null,
        name: f.properties?.name || null,
        residents: !!f.properties?.residents,
      })
    }
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist || a.edge - b.edge)
}

const M_PER_DEG_LAT = (Math.PI / 180) * R

/** Count supporting evidence near the point, by kind. */
function evidenceFor(point, zone, { signs = [], pays = [] } = {}, radiusM = 60) {
  const s = scale(point[1])
  const near = (o) => {
    const dx = (o.lng - point[0]) * s.mPerLng
    const dy = (o.lat - point[1]) * s.mPerLat
    return Math.hypot(dx, dy) <= radiusM
  }
  const scans = signs.filter((x) => near(x) && x.zone_name === zone)
  const payCells = pays.filter((x) => near(x))
  return {
    scans: scans.length,
    // Freshest scan wins the headline: a sign confirmed four days ago is a much
    // stronger statement about today than the same sign confirmed last winter.
    freshestScanAt: scans.length
      ? scans.map((x) => x.created_at).filter(Boolean).sort().at(-1) ?? null
      : null,
    payers: payCells.reduce((n, c) => n + (c.users ?? 0), 0),
  }
}

/**
 * The split verdict.
 *
 * `place` is allowed to be confident and to grow with evidence.
 * `you` is not, and carries the hedge, whose level is computed from the margin
 * between the GPS error and the nearest DIFFERENT zone.
 */
export function zoneClaim({ point, accuracy = 25, geo, signs = [], pays = [] }) {
  const ranked = rankZones(point, geo)
  const here = ranked[0]

  if (!here || here.dist > Math.max(accuracy, 40)) {
    return {
      state: 'none',
      place: null,
      you: { level: 'none', marginM: null, nearestOther: null },
      ranked,
    }
  }

  // The nearest zone that is NOT the one we're claiming. This — not the distance
  // to "an edge" — is what can actually cost the driver money.
  const other = ranked.find((z) => z.zone !== here.zone) ?? null
  const otherDist = other ? other.dist : Infinity

  // How much room is there between the GPS error and being in a different zone?
  // Negative means the error circle already touches the neighbour.
  const marginM = otherDist - accuracy

  const inside = here.inside

  // Two risks live here, and conflating them is what made the first version shout
  // at 63% of the city:
  //
  //   Wrong zone — a DIFFERENT zone sits inside the error circle. This is the one
  //     that costs money: pay Blue's 50 while owing Extra's 100 and you are fined.
  //     It alone sets how loud the warning is.
  //
  //   No zone — the point is outside every polygon, or only barely inside one.
  //     The cost here is an unnecessary payment or a free space, never a fine. It
  //     changes the WORDING and never the alarm.
  //
  // Being 8 m outside a lot with ±15 m of GPS error is not a warning, it is an
  // ordinary fix. Being 2 m inside with ±26 m is not reassurance. Geometry alone
  // decides neither.
  let level
  if (marginM > 30) level = 'quiet'
  else if (marginM > 0) level = 'normal'
  else level = 'loud'

  // Orthogonal to the alarm: how sure are we the driver is on a paid bay at all?
  const spot = inside
    ? (here.edge >= accuracy ? 'inside' : 'edge')
    : (here.dist <= accuracy ? 'edge' : 'outside')

  const ev = evidenceFor(point, here.zone, { signs, pays })
  const sources = 1 + (ev.scans > 0 ? 1 : 0) + (ev.payers >= 5 ? 1 : 0) // registry always counts

  return {
    state: inside ? 'inside' : 'near',
    place: {
      zone: here.zone,
      color: here.color,
      street: here.name,
      residents: here.residents,
      sources,
      evidence: ev,
    },
    you: {
      level,
      spot,                                   // inside | edge | outside
      inside,
      insideByM: inside ? here.edge : null,   // how deep in, when inside
      offByM: inside ? null : here.dist,      // how far out, when not
      accuracyM: accuracy,
      marginM: Number.isFinite(marginM) ? marginM : null,
      nearestOther: other ? { zone: other.zone, distM: other.dist, color: other.color } : null,
    },
    ranked,
  }
}

// Serbian fallback for callers that have no translator. Keys match useLang.
const SR = {
  claimNoData: 'Ovde nemam podatke o zoni.',
  claimSignOnly: 'Tabla pored auta je jedini odgovor.',
  claimPlace: 'Ovaj deo je {zone}.',
  claimSources: 'Potvrđeno iz {n} izvora: {list}.',
  claimSourceRegistry: 'Izvor: registar operatera.',
  claimBitRegistry: 'registar',
  claimBitScan1: '1 skenirana tabla',
  claimBitScans: '{n} skenirane table',
  claimBitPays: 'uplate',
  claimOtherZone: 'Druga zona',
  claimLoud: '⚠ {zone} je {dist} odavde, a GPS greši ±{acc} — ne mogu da ti kažem sa koje si strane linije. Pogledaj tablu.',
  claimNormal: '{zone} počinje {dist} odavde. Ako su kola u njoj, važi ona.',
  claimQuiet: 'Najbliža druga zona je {dist} odavde — tu zabune nema.',
  claimSpotOutside: 'Izgleda da nisi na parking mestu — najbliže je {dist} odavde.',
  claimSpotEdge: 'Na ivici si parking površine, pa ne mogu da potvrdim da je mesto naplatno.',
  claimSpotOutsideCar: 'To mesto nije na parking površini — najbliža je {dist} odatle.',
  claimSpotEdgeCar: 'Kola su na ivici parking površine, pa ne mogu da potvrdim da je mesto naplatno.',
}
const fill = (text, params = {}) =>
  text.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m))

/**
 * Copy for both halves. The hedge is a separate sentence on purpose.
 *
 * `label` turns a registry zone name ("Red Zone") into the one the reader sees on
 * the sign ("Crvena zona"). `tr` is the page's translator (useLang's `t`); without
 * it the Serbian above is used. `car: true` words the spot line about the car —
 * on desktop the place was named by the driver, and "you are at the edge" would
 * be about someone sitting at a laptop.
 */
export function claimLines(c, label = (z) => z, tr = null, { car = false } = {}) {
  const say = (key, params) => (tr ? tr(key, params) : fill(SR[key], params))

  if (!c || c.state === 'none')
    return { place: say('claimNoData'), you: say('claimSignOnly'), level: 'none' }

  const { place, you } = c
  const m = (n) => Math.round(n) + ' m'
  const other = you.nearestOther ? label(you.nearestOther.zone) : say('claimOtherZone')

  const bits = [say('claimBitRegistry')]
  if (place.evidence.scans)
    bits.push(place.evidence.scans === 1 ? say('claimBitScan1') : say('claimBitScans', { n: place.evidence.scans }))
  if (place.evidence.payers >= 5) bits.push(say('claimBitPays'))
  const placeLine = say('claimPlace', { zone: label(place.zone) }) + ' ' +
    (place.sources > 1 ? say('claimSources', { n: place.sources, list: bits.join(', ') }) : say('claimSourceRegistry'))

  // The alarm — driven only by the risk that costs money.
  let youLine
  if (you.level === 'loud') {
    youLine = say('claimLoud', { zone: other, dist: m(you.nearestOther?.distM ?? 0), acc: m(you.accuracyM) })
  } else if (you.level === 'normal') {
    youLine = say('claimNormal', { zone: other, dist: m(you.nearestOther.distM) })
  } else {
    youLine = say('claimQuiet', { dist: m(you.nearestOther?.distM ?? Infinity) })
  }

  // Separate sentence, separate risk: whether this is a paid bay at all. Costs an
  // unnecessary payment at worst, never a fine, so it never raises the alarm.
  const spotLine =
    you.spot === 'outside' ? say(car ? 'claimSpotOutsideCar' : 'claimSpotOutside', { dist: m(you.offByM) })
    : you.spot === 'edge' ? say(car ? 'claimSpotEdgeCar' : 'claimSpotEdge')
    : null

  return { place: placeLine, you: youLine, spot: spotLine, level: you.level }
}
