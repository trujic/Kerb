// ── PAYMENT DEVIATION ─────────────────────────────────────────────────────────
// Finds places where almost nobody pays through Kerb, in a city where almost
// everybody does. It is not a map layer — it is a list of streets worth walking
// to with a camera.
//
// Why a raw rate is useless and a deviation is not: plenty of people never pay
// through Kerb anywhere — they use nSpark, a meter, an ePK card, or they risk it.
// That drags the paid share down across the whole city roughly equally, so it
// sits in both terms of a difference and cancels. What survives the subtraction
// is the local anomaly, which is the only thing worth looking at. Same shape as
// a traffic estimate: the signal is the departure from what this segment normally
// does at this hour, never the absolute number.
//
// What a flag means, and what it does not:
//
//   It means   "nobody here pays through Kerb, and in this zone at this hour 85%
//               normally do" — a fact about Kerb's own telemetry.
//   It doesn't mean "parking is free here". Identical data comes from a street
//               where everyone uses nSpark, and from one where everyone risks it.
//               Only a scanned sign tells those apart.
//
// Asserting "free" from this would invert the product's risk: today a mistake
// costs an unnecessary payment, and that claim would make it cost a fine.

const CELL_M = 50
const Z95 = 1.959964

/** Time blocks the baseline is computed within. Charging hours only — outside
 *  them nobody owes anything, so a low rate there means nothing at all. */
export function timeBlock(date) {
  const d = date.getDay()
  const h = date.getHours() + date.getMinutes() / 60
  if (d === 0) return null                       // Sunday: free, no signal
  if (d === 6) return h >= 7 && h < 14 ? 'sat-am' : null
  if (h >= 7 && h < 12) return 'wd-am'
  if (h >= 12 && h < 17) return 'wd-pm'
  if (h >= 17 && h < 21) return 'wd-eve'
  return null
}

export function cellKey(lat, lng) {
  const dLat = CELL_M / 111_320
  const dLng = CELL_M / (111_320 * Math.cos((lat * Math.PI) / 180))
  return `${Math.round(lat / dLat)}:${Math.round(lng / dLng)}`
}

export function cellCentre(key, refLat) {
  const [gy, gx] = key.split(':').map(Number)
  const dLat = CELL_M / 111_320
  const dLng = CELL_M / (111_320 * Math.cos((refLat * Math.PI) / 180))
  return { lat: gy * dLat, lng: gx * dLng }
}

/**
 * Aggregate raw arrivals into cell × zone × timeblock buckets.
 * `arrived` = reached the pay screen with a zone resolved. That is the honest
 * denominator: it means "intended to park here", not merely "opened the app",
 * which would be a far larger privacy footprint for a far noisier signal.
 */
export function aggregate(observations) {
  const cells = new Map()
  for (const o of observations) {
    const block = o.block ?? timeBlock(new Date(o.t))
    if (!block) continue
    // Keyed by place, NOT by place × time. Slicing the cell by time block as well
    // shatters the sample four ways and nothing reaches the size where a rate can
    // be computed — measured on real Novi Sad geometry: 4,435 cells, 27 usable,
    // zero flags, and all five planted anomalies missed. The time block is a
    // confounder to adjust for, not a dimension to cut by, so it is kept as a
    // per-cell mix and used to build an EXPECTED count instead.
    const key = `${cellKey(o.lat, o.lng)}|${o.zone}`
    const c = cells.get(key) ?? {
      key, cell: cellKey(o.lat, o.lng), zone: o.zone,
      lat: o.lat, lng: o.lng, arrivals: 0, payments: 0,
      payers: new Set(), blocks: {},
    }
    c.arrivals++
    c.blocks[block] = (c.blocks[block] ?? 0) + 1
    if (o.paid) { c.payments++; c.payers.add(o.user) }
    cells.set(key, c)
  }
  return [...cells.values()].map((c) => ({ ...c, payers: c.payers.size }))
}

/**
 * Baseline per zone × timeblock, pooled over every cell. Pooling is what makes
 * it robust: one odd street cannot move the normal it is being judged against.
 */
const MIN_BASELINE_N = 200   // below this a "normal" is itself noise

export function buildBaselines(cells) {
  const byBlock = new Map()
  const byZone = new Map()
  for (const c of cells) {
    const z = byZone.get(c.zone) ?? { arrivals: 0, payments: 0 }
    z.arrivals += c.arrivals
    z.payments += c.payments
    byZone.set(c.zone, z)
    // Payments are not attributed per block, so split them by the block mix. Good
    // enough to correct for time of day, which is all the baseline needs.
    const share = c.arrivals ? c.payments / c.arrivals : 0
    for (const [bk, n] of Object.entries(c.blocks ?? {})) {
      const k = `${c.zone}|${bk}`
      const b = byBlock.get(k) ?? { zone: c.zone, block: bk, arrivals: 0, payments: 0 }
      b.arrivals += n
      b.payments += n * share
      byBlock.set(k, b)
    }
  }

  const zoneRate = new Map()
  for (const [z, a] of byZone) zoneRate.set(z, a.arrivals ? a.payments / a.arrivals : null)

  const out = new Map()
  for (const [k, b] of byBlock) {
    // A thin block falls back to the zone's own rate rather than inventing a
    // "normal" from thirty observations.
    const rate = b.arrivals >= MIN_BASELINE_N ? b.payments / b.arrivals : zoneRate.get(b.zone)
    out.set(k, { ...b, rate, pooled: b.arrivals < MIN_BASELINE_N })
  }
  out.zoneRate = zoneRate
  return out
}

/** Expected payments for a cell, given WHEN its arrivals happened. Indirect
 *  standardisation: each block contributes its own arrivals at its own normal. */
export function expectedFor(cell, baselines) {
  let expected = 0
  let seen = 0
  for (const [bk, n] of Object.entries(cell.blocks ?? {})) {
    const b = baselines.get(`${cell.zone}|${bk}`)
    const rate = b?.rate ?? baselines.zoneRate?.get(cell.zone)
    if (rate == null) continue
    expected += n * rate
    seen += n
  }
  return seen ? { expected, rate: expected / seen } : null
}

/** Wilson upper bound on a proportion — the optimistic end of what the sample
 *  can support. Comparing THAT against the baseline is what stops a thin sample
 *  from producing a confident accusation. */
export function wilsonUpper(payments, arrivals, z = Z95) {
  if (!arrivals) return 1
  const p = payments / arrivals
  const d = 1 + (z * z) / arrivals
  const centre = (p + (z * z) / (2 * arrivals)) / d
  const half = (z * Math.sqrt((p * (1 - p)) / arrivals + (z * z) / (4 * arrivals * arrivals))) / d
  return Math.min(1, centre + half)
}

export const GATES = { kUsers: 5, arrivals: 30, dropPP: 40 }

/**
 * Three gates, in order, and the funnel is reported so it is visible WHICH gate
 * is doing the rejecting — at small user counts it is always the sample size,
 * and no threshold tuning fixes that.
 */
export function flagCells(cells, baselines, gates = GATES) {
  const funnel = { total: cells.length, anon: 0, enough: 0, flagged: 0 }
  const flags = []

  for (const c of cells) {
    if (c.payers < gates.kUsers && c.payments > 0) continue
    funnel.anon++
    if (c.arrivals < gates.arrivals) continue
    funnel.enough++

    const exp = expectedFor(c, baselines)
    if (!exp) continue

    const rate = c.payments / c.arrivals
    const upper = wilsonUpper(c.payments, c.arrivals)
    // Even the optimistic end of this cell's estimate must sit far below what
    // this cell's own mix of hours would normally produce. A point estimate alone
    // would flag noise on thin samples.
    const dropPP = (exp.rate - upper) * 100
    if (dropPP < gates.dropPP) continue

    funnel.flagged++
    flags.push({
      ...c,
      rate,
      upper,
      baseline: exp.rate,
      expected: exp.expected,
      dropPP,
      // Never "free here" — always a statement about Kerb's own numbers.
      says: `${c.payments} od ${c.arrivals} je platilo preko Kerba (${Math.round(rate * 100)}%), ` +
            `a u zoni ${c.zone} u ovim terminima inače plaća ${Math.round(exp.rate * 100)}%.`,
    })
  }

  flags.sort((a, b) => b.dropPP - a.dropPP)
  return { flags, funnel }
}
