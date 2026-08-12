// ── NOVI SAD ZONE AUDIT ───────────────────────────────────────────────────────
// Checks the published map against the operator's own street lists.
//
//   Source: JKP Parking servis Novi Sad — parkingns.rs/parkiralista/{zona}/
//   Checks: public/zones/novi-sad.json (or --live to check the database copy,
//           which is what drivers actually see — the two can drift apart)
//
// The hard part is that the operator qualifies streets by STRETCH:
//
//   "Булевар ослобођења II (од Булевара краља Петра Првог до Улице Пап Павла)"
//
// Bulevar oslobođenja runs through several zones along its length, exactly as
// Bulevar despota Stefana does in Belgrade. A first pass at this audit sampled
// whole streets and reported 46 disagreements, most of which were its own fault:
// a street that is Blue for two blocks and unpaid for two kilometres looks like a
// map error when you sample the kilometres.
//
// So a stretch is resolved before anything is compared. The two named cross
// streets are found in OSM, intersected with the main street, and only the
// points between those intersections are sampled. Where a cross street cannot be
// found the street is reported UNRESOLVED rather than counted as a mismatch —
// an audit that cannot tell "wrong" from "I could not check" is worse than none.
//
// What is being checked is PRESENCE, in both directions, not proportion:
//
//   A. every street on the operator's list has paid geometry somewhere on it
//   B. every piece of our geometry sits on a street the operator lists
//
// Coverage percentages are reported but decide nothing. Dunavska is mostly a
// pedestrian street with one paid stretch, so 3% of its length being zoned is
// the correct answer, not a gap — while a single unlisted street carrying our
// geometry is a gap however small it is, because it tells a driver to pay where
// the operator sells nothing.
//
// Run:  node scripts/audit-novisad-zones.mjs [--live] [--refresh]
//       --refresh  re-scrape parkingns.rs and re-fetch OSM geometry
//       --live     audit the database copy instead of the committed file

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const CACHE = resolve(__dir, '.audit-cache')
const OUT = resolve(__dir, 'audit-novisad-report.json')
const LIVE = process.argv.includes('--live')
const REFRESH = process.argv.includes('--refresh')

const ZONE_PAGES = {
  'Extra Zone': 'ekstra-zona',
  'Red Zone': 'crvena-zona',
  'Blue Zone': 'plava-zona',
  'White Zone': 'bela-zona',
}
const BBOX = '45.20,19.75,45.31,19.93'

// ── text ──────────────────────────────────────────────────────────────────────
const CYR = {
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I','Ј':'J','К':'K',
  'Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U',
  'Ф':'F','Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š','а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ',
  'е':'e','ж':'ž','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o',
  'п':'p','р':'r','с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c','ч':'č','џ':'dž','ш':'š',
}
const toLatin = (s) => s.split('').map((c) => CYR[c] ?? c).join('')

/** Comparison key: accents folded, punctuation dropped. Roman numerals are KEPT
 *  here — they are how the operator distinguishes one stretch from the next. */
const norm = (s) =>
  toLatin(s).toLowerCase()
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, ' ').trim()

/** Street identity: the same but WITHOUT the stretch numeral. */
const streetKey = (s) => norm(s).replace(/\b[ivx]+\b/g, ' ').replace(/\s+/g, ' ').trim()

/** Words that decorate a cross-street reference without naming it. */
const STOP = /^(ulice|ulica|bulevara|bulevar|trga|trg|k|br|do|od)$/

// ── geometry ──────────────────────────────────────────────────────────────────
const M_LAT = 110540
const mLng = (la) => 111320 * Math.cos((la * Math.PI) / 180)
const distM = (a, b) => Math.hypot((a[0] - b[0]) * mLng(a[1]), (a[1] - b[1]) * M_LAT)

const inRing = (ring, lat, lng) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1], xi = ring[i][0], xj = ring[j][0]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** What our map says at a point: the containing polygon, or an edge within 20 m —
 *  the same radius the app treats as "you are standing on it". */
function zoneAt(geo, lat, lng) {
  let best = null
  for (const f of geo.features) {
    const z = f.properties?.zone, g = f.geometry
    if (!z || !g) continue
    const polys = g.type === 'Polygon' ? [g.coordinates]
      : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) {
      if (inRing(poly[0], lat, lng) && !poly.slice(1).some((r) => inRing(r, lat, lng))) return z
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const n = (i + 1) % ring.length
          const ax = (ring[i][0] - lng) * mLng(lat), ay = (ring[i][1] - lat) * M_LAT
          const bx = (ring[n][0] - lng) * mLng(lat), by = (ring[n][1] - lat) * M_LAT
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
          let t = L ? -(ax * dx + ay * dy) / L : 0
          t = Math.max(0, Math.min(1, t))
          const d = Math.hypot(ax + t * dx, ay + t * dy)
          if (!best || d < best.d) best = { z, d }
        }
      }
    }
  }
  return best && best.d <= 20 ? best.z : null
}

/** Where two streets meet: the closest approach between their geometries, if it
 *  is close enough to be a junction rather than two roads passing nearby. */
function junction(aWays, bWays) {
  let best = null
  for (const A of aWays) for (const B of bWays) {
    for (const p of A) for (const q of B) {
      const d = distM([p.lon, p.lat], [q.lon, q.lat])
      if (!best || d < best.d) best = { d, at: [p.lon, p.lat] }
    }
  }
  return best && best.d <= 40 ? best.at : null
}

// ── sources ───────────────────────────────────────────────────────────────────
async function scrapeOfficial() {
  const file = resolve(CACHE, 'official.json')
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const { chromium } = await import(
    '/home/nemanja/.nvm/versions/node/v22.21.1/lib/node_modules/playwright/index.mjs'
  )
  const b = await chromium.launch({ headless: false })
  const page = await (await b.newContext({ locale: 'sr-RS' })).newPage()
  const out = {}
  for (const [zone, slug] of Object.entries(ZONE_PAGES)) {
    await page.goto(`https://parkingns.rs/parkiralista/${slug}/`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(1500)
    const lis = await page.evaluate(() =>
      [...(document.querySelector('main') || document.body).querySelectorAll('li')]
        .map((n) => n.innerText.trim()).filter((x) => x && x.length < 120))
    out[zone] = lis.filter((x) => !/nSpark|^SMS$|parking karta|еПК|Мапа|Галерија/i.test(x))
    console.log(`  ${zone}: ${out[zone].length} unosa`)
  }
  await b.close()
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(file, JSON.stringify(out, null, 1))
  return out
}

async function fetchOsm() {
  const file = resolve(CACHE, 'osm.json')
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const q = `[out:json][timeout:180];way["highway"]["name"](${BBOX});out geom;`
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': 'Kerb-audit/1.0 (parking zone check)' },
          body: 'data=' + encodeURIComponent(q),
        })
        if (!r.ok) { console.log(`  overpass ${r.status}`); await new Promise((s) => setTimeout(s, 8000)); continue }
        const d = await r.json()
        mkdirSync(CACHE, { recursive: true })
        writeFileSync(file, JSON.stringify(d))
        return d
      } catch (e) { console.log('  overpass:', e.message.slice(0, 60)) }
    }
  }
  throw new Error('Overpass unavailable — try again, or run without --refresh')
}

async function loadZones() {
  if (!LIVE) return JSON.parse(readFileSync(resolve(__dir, '../public/zones/novi-sad.json'), 'utf8'))
  const env = Object.fromEntries(
    readFileSync(resolve(__dir, '../.env'), 'utf8').split('\n').filter((l) => l.includes('='))
      .map((l) => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim().replace(/^"|"$/g, '')] }))
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/city_zones?city_id=eq.novi-sad&select=geojson`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  })
  const d = await r.json()
  if (!d[0]?.geojson) throw new Error('no city_zones row for novi-sad')
  return d[0].geojson
}

// ── audit ─────────────────────────────────────────────────────────────────────
const run = async () => {
  console.log(`Auditing the ${LIVE ? 'LIVE database' : 'committed file'} against parkingns.rs…`)
  const [official, osm, geo] = [await scrapeOfficial(), await fetchOsm(), await loadZones()]
  console.log(`  ${geo.features.length} segmenata u mapi · ${osm.elements.length} OSM ulica`)

  const ways = new Map()
  for (const w of osm.elements) {
    if (!w.geometry?.length) continue
    const k = streetKey(w.tags?.name ?? '')
    if (!k) continue
    if (!ways.has(k)) ways.set(k, [])
    ways.get(k).push(w.geometry)
  }
  /**
   * The cross street named in a range, matched loosely on purpose.
   *
   * Requiring every word fails on the two ways the sources disagree: the operator
   * writes "Булевара краља Петра Првог" where OSM has "Bulevar kralja Petra I",
   * and "Пап Павла" where OSM has "Pavla Papa" — a numeral spelled out, and a
   * name in the other order. Scoring on shared words survives both; demanding a
   * long word in common keeps it from matching on "trg" alone.
   */
  const findStreet = (text) => {
    const want = norm(text).split(' ').filter((w) => w && !STOP.test(w))
    if (!want.length) return null
    let best = null
    for (const [k, g] of ways) {
      const hit = want.filter((w) => k.includes(w))
      if (!hit.length) continue
      const score = hit.length / want.length
      if (score < 0.5 || !hit.some((w) => w.length >= 4)) continue
      if (!best || score > best.score || (score === best.score && k.length < best.k.length))
        best = { k, g, score }
    }
    return best?.g ?? null
  }

  const rows = []
  for (const [zone, entries] of Object.entries(official)) {
    for (const raw of entries) {
      const text = toLatin(raw)
      const name = text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
      if (name.length < 3) continue
      const range = (text.match(/\(od ([^)]+?) do ([^)]+?)\)/i) || []).slice(1)
      const g = ways.get(streetKey(name))
      if (!g) { rows.push({ zone, street: name, status: 'NOT-A-STREET' }); continue }

      // Points to test: the whole street, or only the named stretch.
      let pts = []
      for (const line of g) {
        const step = Math.max(1, Math.floor(line.length / 12))
        for (let i = 0; i < line.length; i += step) pts.push([line[i].lon, line[i].lat])
      }
      let scope = 'whole street'
      if (range.length === 2) {
        const A = findStreet(range[0]), B = findStreet(range[1])
        const ja = A && junction(g, A), jb = B && junction(g, B)
        if (!ja || !jb) {
          rows.push({ zone, street: name, status: 'UNRESOLVED', range: range.join(' → ') })
          continue
        }
        // Between the two junctions: the ellipse with them as foci, 30% slack for
        // a street that bends. Anything past either end falls outside it.
        const span = distM(ja, jb) * 1.3 + 25
        pts = pts.filter((p) => distM(p, ja) + distM(p, jb) <= span)
        scope = `${range[0]} → ${range[1]}`
        if (pts.length < 2) { rows.push({ zone, street: name, status: 'UNRESOLVED', range: scope }); continue }
      }

      const seen = {}
      for (const [lng, lat] of pts) {
        const z = zoneAt(geo, lat, lng) ?? 'none'
        seen[z] = (seen[z] ?? 0) + 1
      }
      const pct = Math.round((100 * (seen[zone] ?? 0)) / pts.length)
      const others = Object.keys(seen).filter((k) => k !== zone && k !== 'none')
      // Presence, not proportion. A listed street needs paid geometry of its own
      // zone SOMEWHERE on it; how much of its length is paid is the operator's
      // business, not ours — most of Dunavska is a pedestrian street.
      const status =
        (seen[zone] ?? 0) > 0 ? (others.length ? 'OK-MIXED' : 'OK')
        : others.length ? 'WRONG-ZONE'
        : 'MISSING'
      rows.push({ zone, street: name, scope, points: pts.length, pct, ours: seen, status })
    }
  }

  // ── B. our geometry → the operator's list ──────────────────────────────────
  // The direction never checked before, and the one that costs a driver money:
  // geometry on a street the operator does not list tells someone to pay where
  // nothing is sold.
  const listed = new Map()
  for (const [zone, entries] of Object.entries(official)) {
    for (const raw of entries) {
      const nm = toLatin(raw).replace(/\([^)]*\)/g, '').trim()
      if (nm.length < 3) continue
      const k = streetKey(nm)
      if (!listed.has(k)) listed.set(k, new Set())
      listed.get(k).add(zone)
    }
  }
  /** The named OSM street a point sits on, if one is close enough to be its street. */
  const streetAt = (lat, lng) => {
    let best = null
    for (const [k, lines] of ways) {
      for (const line of lines) {
        for (const p of line) {
          const d = distM([lng, lat], [p.lon, p.lat])
          if (!best || d < best.d) best = { k, d }
        }
      }
    }
    return best && best.d <= 30 ? best.k : null
  }
  const extra = new Map()
  for (const f of geo.features) {
    const z = f.properties?.zone, g = f.geometry
    if (!z || !g) continue
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    const pts = []
    for (const poly of polys) {
      const ring = poly[0] ?? []
      const step = Math.max(1, Math.floor(ring.length / 4))
      for (let i = 0; i < ring.length; i += step) pts.push(ring[i])
    }
    if (!pts.length) continue
    const names = pts.map(([lng, lat]) => streetAt(lat, lng)).filter(Boolean)
    if (!names.length) { const k = `?:${z}`; extra.set(k, { street: '(nije uz imenovanu ulicu)', zone: z, n: (extra.get(k)?.n ?? 0) + 1 }); continue }
    const k = names.sort((a, b) => names.filter((x) => x === b).length - names.filter((x) => x === a).length)[0]
    // Matched the same loose way as the cross streets, and for the same reason:
    // the operator writes "Bulevar kralja Petra Prvog IV" where OSM has
    // "Bulevar kralja Petra I". An exact key lookup called five correct Blue
    // segments unlisted.
    let zones = listed.get(k)
    if (!zones) {
      const want = k.split(' ').filter((w) => w && !STOP.test(w))
      let best = null
      for (const [lk, lz] of listed) {
        const hit = want.filter((w) => lk.includes(w))
        const score = hit.length / Math.max(1, want.length)
        if (score < 0.6 || !hit.some((w) => w.length >= 4)) continue
        if (!best || score > best.score) best = { score, lz }
      }
      zones = best?.lz ?? null
    }
    if (zones && zones.has(z)) continue           // listed, same zone — fine
    const id = `${k}:${z}`
    const prev = extra.get(id)
    extra.set(id, {
      street: k, zone: z, n: (prev?.n ?? 0) + 1,
      listedAs: zones ? [...zones].join(', ') : null,
    })
  }
  const extras = [...extra.values()].sort((a, b) => b.n - a.n)

  writeFileSync(OUT, JSON.stringify({ listToMap: rows, mapToList: extras }, null, 1))
  const n = (s) => rows.filter((r) => r.status === s).length
  console.log(`\n  ${rows.length} unosa provereno`)
  console.log(`   OK            ${n('OK')}   ← ima našu geometriju te zone`)
  console.log(`   OK-MIXED      ${n('OK-MIXED')}   ← ima je, ali i geometriju druge zone`)
  console.log(`   WRONG-ZONE    ${n('WRONG-ZONE')}   ← geometrija postoji, ali pogrešne zone`)
  console.log(`   MISSING       ${n('MISSING')}   ← nigde na toj ulici nemamo ništa`)
  console.log(`   UNRESOLVED    ${n('UNRESOLVED')}   ← deonicu nisam mogao da odredim`)
  console.log(`   NOT-A-STREET  ${n('NOT-A-STREET')}   ← plato/parkiralište, nije imenovan put`)

  const bad = rows.filter((r) => r.status === 'WRONG-ZONE' || r.status === 'MISSING')
  if (bad.length) {
    console.log('\n  A. NA SPISKU, NEMA NA MAPI:')
    for (const r of bad) {
      const o = Object.entries(r.ours).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')
      console.log(`   ${r.status === 'MISSING' ? 'nema ničega ' : 'druga zona '} ${r.zone.padEnd(11)} ${r.street.slice(0, 30).padEnd(32)} ${o}`)
    }
  }
  console.log(`\n  B. NA MAPI, NEMA NA SPISKU: ${extras.length} slučaj(a)`)
  for (const e of extras.slice(0, 25)) {
    console.log(`   ${String(e.n).padStart(3)} seg  ${e.zone.padEnd(11)} ${e.street.slice(0, 34).padEnd(36)}` +
      (e.listedAs ? `  (spisak je vodi kao: ${e.listedAs})` : '  (uopšte nije na spisku)'))
  }
  console.log(`\n  Ceo izveštaj: scripts/${OUT.split('/').pop()}`)
}

run().catch((e) => { console.error('Audit failed:', e.message); process.exit(1) })
