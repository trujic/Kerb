// ── NEW YORK PARKING SIGNS ────────────────────────────────────────────────────
// New York publishes every parking sign in the city as open data — 441,270 of
// them, each with the street, the two cross streets, which side of the road, the
// text on the plate, how far it stands from the corner, and the date the order
// was completed. No other city in Kerb comes close, and it is the only source
// anywhere that literally contains what the sign says.
//
//   Source: NYC Open Data — "Parking Regulation Locations and Signs" (nfid-uabd)
//
//   GET /api/nyc-signs?street=3+AVENUE            → the blocks on that street
//   GET /api/nyc-signs?street=3+AVENUE&from=EAST+85+STREET → that block's signs
//
// Why this is a server route and not a fetch from the page: the dataset is far
// too large to ship, the query needs escaping we do not want to hand-roll in a
// component, and the sign text needs parsing before it is fit to read. The city
// is queried live — it is refreshed continuously and a copy of ours would be the
// stale thing on the page.
//
// What this deliberately does NOT do: resolve a GPS point to a blockface. The
// coordinates in the dataset are New York State Plane feet, and the arrows on a
// sign (`<->`, `-->`) say which way along the kerb the rule reaches from the
// post — get that wrong and you show a driver the rule for the other half of the
// block. Until that is done properly, the driver names the block.

const SOCRATA = 'https://data.cityofnewyork.us/resource/nfid-uabd.json'

// Bus route/destination panels and location plates are half the dataset and none
// of them are a parking rule. Dropping them here keeps the noise off the page.
const NOISE = /MTA|PANEL|DESTINATION|BOTTOM LOCATION|ROUTE/i

export type SignKind =
  | 'metered' | 'street-cleaning' | 'no-standing' | 'no-parking' | 'no-stopping'
  | 'bus-stop' | 'pay-by-cell' | 'other'

export interface ParsedSign {
  kind: SignKind
  /** Days the rule applies, uppercase, or null for "every day". */
  days: string[] | null
  /** Days explicitly excluded, e.g. ["SUNDAY"]. */
  except: string[] | null
  from: string | null
  to: string | null
  /** Hours from an "N HMP" (hour metered parking) sign. */
  maxHours: number | null
  commercialOnly: boolean
  schoolDays: boolean
  overnight: boolean
  /** Which way the rule reaches from the post, as drawn on the plate. */
  arrow: 'both' | 'forward' | 'back' | null
  side: string | null
  feetFromCorner: number | null
  /** When the sign order was completed — how old this record is. */
  dated: string | null
  text: string
}

const DAY_WORDS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

const clean = (s: string) =>
  s.replace(/\s*\(SUPERSEDES[^)]*\)/gi, '')
    .replace(/\s*\((?:SANITATION BROOM|BUS & HANDICAP|MOON & STARS|HARDHAT)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const parseTime = (t: string) => {
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|MID(?:NIGHT)?|NOON)?$/i)
  if (!m) return null
  let h = parseInt(m[1]!, 10)
  const min = m[2] ?? '00'
  const mer = (m[3] ?? '').toUpperCase()
  if (mer.startsWith('PM') && h !== 12) h += 12
  if (mer.startsWith('AM') && h === 12) h = 0
  // Some plates carry construction notes and other prose that the span regex can
  // still bite on, producing hours like 30. A refusal beats a wrong hour.
  if (h > 23 || Number(min) > 59) return null
  return `${String(h).padStart(2, '0')}:${min}`
}

/**
 * "MONDAY-FRIDAY" is a range and means five days. "TUESDAY FRIDAY" is a list and
 * means two. Both forms are common — the street-cleaning plates use the list, the
 * commercial-vehicle plates use the range — and reading one as the other tells a
 * driver the rule applies on days it does not.
 */
const parseDays = (t: string): string[] => {
  const range = t.match(
    new RegExp(`\\b(${DAY_WORDS.join('|')})\\s*(?:-|\\bTHRU\\b|\\bTO\\b)\\s*(${DAY_WORDS.join('|')})\\b`),
  )
  if (range) {
    const a = DAY_WORDS.indexOf(range[1]!)
    const b = DAY_WORDS.indexOf(range[2]!)
    if (a > -1 && b > -1) {
      const out: string[] = []
      for (let i = a; ; i = (i + 1) % 7) {
        out.push(DAY_WORDS[i]!)
        if (i === b || out.length > 7) break
      }
      return out
    }
  }
  return DAY_WORDS.filter((d) => new RegExp(`\\b${d}\\b`).test(t))
}

export const parseSign = (row: any): ParsedSign => {
  const raw = String(row.sign_description ?? '')
  const t = clean(raw).toUpperCase()

  let kind: SignKind = 'other'
  if (/PAY-BY-CELL/.test(t)) kind = 'pay-by-cell'
  else if (/BUS STOP/.test(t)) kind = 'bus-stop'
  else if (/\bHMP\b|METERED/.test(t)) kind = 'metered'
  // The broom symbol is street cleaning — that is Alternate Side Parking, and it
  // is the rule that tows people who read only the meter sign above it.
  else if (/SANITATION BROOM/i.test(raw)) kind = 'street-cleaning'
  else if (/NO STOPPING/.test(t)) kind = 'no-stopping'
  else if (/NO STANDING/.test(t)) kind = 'no-standing'
  else if (/NO PARKING/.test(t)) kind = 'no-parking'

  const except = DAY_WORDS.filter((d) => new RegExp(`EXCEPT[^A-Z]*${d}`).test(t))
  const days = parseDays(t).filter((d) => !except.includes(d))

  const span = t.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|MIDNIGHT|MID|NOON)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|MIDNIGHT|MID|NOON)?)/)
  const hmp = t.match(/(\d+)\s*HMP/)
  // Half a time span is worse than none: "from 06:00" with no end reads as a rule
  // that never stops. If either end fails to parse, the window is not claimed.
  const fromT = span ? parseTime(span[1]!.trim()) : null
  const toT = span ? parseTime(span[2]!.trim()) : null
  const window = fromT && toT ? { from: fromT, to: toT } : { from: null, to: null }

  return {
    kind,
    days: days.length ? days : null,
    except: except.length ? except : null,
    from: window.from,
    to: window.to,
    maxHours: hmp ? parseInt(hmp[1]!, 10) : null,
    commercialOnly: /COMMERCIAL VEHICLES ONLY/.test(t),
    schoolDays: /SCHOOL DAYS/.test(t),
    overnight: /MOON & STARS/i.test(raw),
    arrow: /<-+>/.test(t) ? 'both' : /-+>/.test(t) ? 'forward' : /<-+/.test(t) ? 'back' : null,
    side: row.side_of_street ?? null,
    feetFromCorner: row.distance_from_intersection ? Number(row.distance_from_intersection) : null,
    dated: row.order_completed_on_date ? String(row.order_completed_on_date).slice(0, 10) : null,
    text: clean(raw),
  }
}

const socrata = async (query: string) => {
  const res = await fetch(`${SOCRATA}?${query}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `NYC Open Data returned ${res.status}` })
  return res.json() as Promise<any[]>
}

const esc = (s: string) => s.replace(/'/g, "''").toUpperCase().trim()

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const street = typeof q.street === 'string' ? esc(q.street) : ''
  const from = typeof q.from === 'string' ? esc(q.from) : ''

  if (street.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'street is required (min 2 characters)' })
  }

  // Typing "3 AVENUE" also matches "103 AVENUE", and picking the wrong street is
  // a silent way to read the wrong block's rules. So when the text matches more
  // than one street name, the driver names the street before naming the block.
  //
  // `exact` is how the caller says "this IS the street name, stop searching" —
  // without it, choosing 3 Avenue from the list would just match 13 Avenue again
  // and the picker would loop forever.
  const exactAsked = q.exact === '1' || q.exact === 'true'

  if (!from && exactAsked) {
    const rows = await socrata(
      `$select=on_street,from_street,to_street,count(*)` +
        `&$where=${encodeURIComponent(`record_type='Current' AND on_street='${street.replace(/'/g, "''")}'`)}` +
        `&$group=on_street,from_street,to_street&$order=from_street&$limit=200`,
    )
    return {
      mode: 'blocks' as const,
      street,
      blocks: rows
        .filter((r) => r.from_street && r.to_street)
        .map((r) => ({
          on: r.on_street,
          from: r.from_street,
          to: r.to_street,
          signs: Number(r.count ?? 0),
        })),
    }
  }

  if (!from) {
    const names = await socrata(
      `$select=on_street,count(*)` +
        `&$where=${encodeURIComponent(`record_type='Current' AND on_street like '%${street}%'`)}` +
        `&$group=on_street&$order=count desc&$limit=25`,
    )
    const exact = names.find((n) => String(n.on_street ?? '').toUpperCase() === street)

    if (names.length > 1 && !(exact && names.length === 1)) {
      return {
        mode: 'streets' as const,
        street,
        streets: names.map((n) => ({ name: n.on_street, signs: Number(n.count ?? 0) })),
      }
    }

    const chosen = String(exact?.on_street ?? names[0]?.on_street ?? street).toUpperCase()
    const rows = await socrata(
      `$select=on_street,from_street,to_street,count(*)` +
        `&$where=${encodeURIComponent(`record_type='Current' AND on_street='${chosen.replace(/'/g, "''")}'`)}` +
        `&$group=on_street,from_street,to_street&$order=from_street&$limit=200`,
    )
    return {
      mode: 'blocks' as const,
      street: chosen,
      blocks: rows
        .filter((r) => r.from_street && r.to_street)
        .map((r) => ({
          on: r.on_street,
          from: r.from_street,
          to: r.to_street,
          signs: Number(r.count ?? 0),
        })),
    }
  }

  // Step two: one named block, both sides, parsed and ordered along the kerb.
  const rows = await socrata(
    `$where=${encodeURIComponent(
      `record_type='Current' AND on_street like '%${street}%' AND from_street like '%${from}%'`,
    )}&$order=side_of_street,distance_from_intersection&$limit=200`,
  )

  const useful = rows.filter((r) => !NOISE.test(String(r.sign_description ?? '')))
  const parsed = useful.map(parseSign)

  // The ParkNYC zone number lives in sign_notes on the pay-by-cell plate — the
  // one number a driver actually has to type into the app.
  const payByCell = useful.find((r) => /PAY-BY-CELL/i.test(String(r.sign_description ?? '')))
  // A block carries the same rule on several posts — one near each corner, often
  // more. Listing "street cleaning Tue 9:30–11" four times reads as four rules.
  // Collapse identical rules per side, keep the nearest post, and say how many
  // plates repeat it, because that is what the driver sees walking the kerb.
  const bySide: Record<string, (ParsedSign & { posts: number })[]> = {}
  for (const p of parsed) {
    const side = p.side ?? '?'
    const list = (bySide[side] ??= [])
    const key = (s: ParsedSign) =>
      [s.kind, s.days?.join(','), s.except?.join(','), s.from, s.to, s.maxHours, s.commercialOnly, s.text].join('|')
    const seen = list.find((x) => key(x) === key(p))
    if (seen) {
      seen.posts++
      if (p.feetFromCorner != null && (seen.feetFromCorner == null || p.feetFromCorner < seen.feetFromCorner))
        seen.feetFromCorner = p.feetFromCorner
    } else {
      list.push({ ...p, posts: 1 })
    }
  }

  return {
    mode: 'block' as const,
    street,
    from,
    to: rows[0]?.to_street ?? null,
    borough: rows[0]?.borough ?? null,
    payByCellNumber: payByCell?.sign_notes ?? null,
    /** How many rows the city held for this block before we dropped bus panels. */
    signsTotal: rows.length,
    signsShown: parsed.length,
    /** Newest sign order on the block — how fresh the city's own record is. */
    newestSign: parsed.map((p) => p.dated).filter(Boolean).sort().pop() ?? null,
    sides: bySide,
    source: 'NYC Open Data · Parking Regulation Locations and Signs (nfid-uabd)',
  }
})
