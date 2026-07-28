#!/usr/bin/env node
// ── ZONE VALIDATOR ────────────────────────────────────────────────────────────
// Run before an exported trace lands in public/zones/. Nothing else checks this,
// and the failures are all silent: a zone name that does not match the DB loses
// its price and shortcode, two zones over the same ground make the answer depend
// on file order, and a street nobody covered simply reads as "no paid parking".
//
//   node scripts/validate-zones.mjs <city-id> [path-to-geojson]
//
// Without a path it checks the file already in public/zones/<city>.json.
// Needs SUPABASE_URL + SUPABASE_SERVICE_KEY for the zone-name and street checks;
// geometry checks run without them.

import fs from 'node:fs'
import path from 'node:path'

const cityId = process.argv[2]
if (!cityId) {
  console.error('usage: node scripts/validate-zones.mjs <city-id> [file.json]')
  process.exit(2)
}
const file = process.argv[3] || `public/zones/${cityId}.json`
const geo = JSON.parse(fs.readFileSync(file, 'utf8'))
const features = geo.features ?? []

let problems = 0
const fail = (msg) => { problems++; console.log(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)
const note = (msg) => console.log(`    ${msg}`)

console.log(`\n${path.basename(file)} — ${features.length} features\n`)

// ── geometry ──────────────────────────────────────────────────────────────────
console.log('GEOMETRY')
const ringsOf = (f) =>
  f.geometry.type === 'Polygon' ? f.geometry.coordinates
  : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : []
const lineOf = (f) =>
  f.geometry.type === 'LineString' ? [f.geometry.coordinates]
  : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : []

const M_LAT = 110540
const mLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)
const areaOf = (ring) => {
  const k = mLng(ring[0][1])
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * k * ring[i + 1][1] * M_LAT - ring[i + 1][0] * k * ring[i][1] * M_LAT
  }
  return Math.abs(a) / 2
}

let badRing = 0, unclosed = 0
const tiny = []
features.forEach((f, i) => {
  for (const r of ringsOf(f)) {
    if (r.length < 4) badRing++
    else if (r[0][0] !== r.at(-1)[0] || r[0][1] !== r.at(-1)[1]) unclosed++
  }
  const outer = ringsOf(f)[0]
  if (outer && outer.length >= 4 && areaOf(outer) < 50) tiny.push([i, Math.round(areaOf(outer))])
  for (const l of lineOf(f)) if (l.length < 2) badRing++
})
badRing ? fail(`${badRing} ring(s)/line(s) with too few points`) : ok('all rings closed and well-formed')
if (unclosed) fail(`${unclosed} unclosed ring(s)`)
if (tiny.length) {
  fail(`${tiny.length} polygon(s) under 50 m² — likely stray clicks`)
  note(tiny.map(([i, a]) => `#${i} (${a} m²)`).join(', '))
}

// ── zone names against the database ───────────────────────────────────────────
console.log('\nZONE NAMES')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
let dbZones = null
if (url && key) {
  const res = await fetch(`${url}/rest/v1/zones?city_id=eq.${cityId}&select=name`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (res.ok) dbZones = new Set((await res.json()).map((z) => z.name))
}
const used = new Set(features.map((f) => f.properties?.zone))
if (!dbZones) {
  note('skipped — set SUPABASE_URL and SUPABASE_SERVICE_KEY to check')
} else {
  const unknown = [...used].filter((z) => !dbZones.has(z))
  const uncovered = [...dbZones].filter((z) => !used.has(z))
  unknown.length
    ? fail(`zone(s) not in the database, so no price or shortcode: ${unknown.join(', ')}`)
    : ok('every zone name matches the database')
  if (uncovered.length) fail(`zone(s) with no geometry at all: ${uncovered.join(', ')}`)
}

// ── overlaps between different zones ──────────────────────────────────────────
console.log('\nOVERLAPS')
// Where two zones cover the same ground the resolver takes whichever comes first
// in the file, so the price a driver is shown depends on export order.
const bbox = (r) => {
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
const inside = ([x, y], r) => {
  let c = false
  for (let i = 0; i < r.length - 1; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[i + 1]
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c
  }
  return c
}
const polys = features.map((f, i) => ({ i, zone: f.properties?.zone, ring: ringsOf(f)[0] }))
  .filter((p) => p.ring?.length >= 4)
polys.forEach((p) => (p.bb = bbox(p.ring)))

const overlaps = []
for (let a = 0; a < polys.length; a++) {
  for (let b = a + 1; b < polys.length; b++) {
    const P = polys[a], Q = polys[b]
    if (P.zone === Q.zone) continue
    if (P.bb[2] < Q.bb[0] || Q.bb[2] < P.bb[0] || P.bb[3] < Q.bb[1] || Q.bb[3] < P.bb[1]) continue
    // Sample the shared box at ~4 m to size the intersection; edge-touching
    // slivers are unavoidable when tracing and are not worth reporting.
    const x0 = Math.max(P.bb[0], Q.bb[0]), y0 = Math.max(P.bb[1], Q.bb[1])
    const x1 = Math.min(P.bb[2], Q.bb[2]), y1 = Math.min(P.bb[3], Q.bb[3])
    const sx = 4 / mLng(y0), sy = 4 / M_LAT
    const nx = Math.min(600, Math.max(1, Math.ceil((x1 - x0) / sx)))
    const ny = Math.min(600, Math.max(1, Math.ceil((y1 - y0) / sy)))
    let hits = 0
    for (let gx = 0; gx <= nx; gx++) {
      for (let gy = 0; gy <= ny; gy++) {
        const pt = [x0 + gx * sx, y0 + gy * sy]
        if (inside(pt, P.ring) && inside(pt, Q.ring)) hits++
      }
    }
    const m2 = hits * 16
    if (m2 >= 200) overlaps.push({ m2, P, Q })
  }
}
overlaps.sort((a, b) => b.m2 - a.m2)
if (!overlaps.length) ok('no zone overlaps above 200 m²')
else {
  fail(`${overlaps.length} place(s) where two zones cover the same ground`)
  for (const o of overlaps.slice(0, 10)) {
    const c = o.P.ring[0]
    note(`~${o.m2} m²  #${o.P.i} ${o.P.zone} × #${o.Q.i} ${o.Q.zone}  at ${c[1].toFixed(5)},${c[0].toFixed(5)}`)
  }
}

// ── street coverage ───────────────────────────────────────────────────────────
console.log('\nSTREET COVERAGE')
const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',ђ:'dj',е:'e',ж:'z',з:'z',и:'i',ј:'j',к:'k',л:'l',љ:'lj',м:'m',н:'n',њ:'nj',о:'o',п:'p',р:'r',с:'s',т:'t',ћ:'c',у:'u',ф:'f',х:'h',ц:'c',ч:'c',џ:'dz',ш:'s' }
const norm = (s) => {
  let out = s.toLowerCase().split('').map((c) => CYR[c] ?? c).join('')
  out = out.replace(/đ/g, 'dj').replace(/[ćč]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z')
  out = out.normalize('NFD').replace(/\p{Mn}/gu, '')
  out = out.replace(/^(bulevar|bul\.?|ulica|ul\.?|trg)\s+/, '')
  return out.split(/\s+/).filter(Boolean).join(' ')
}
const zoneAt = (pt) => {
  for (const p of polys) {
    if (pt[0] < p.bb[0] || pt[0] > p.bb[2] || pt[1] < p.bb[1] || pt[1] > p.bb[3]) continue
    if (inside(pt, p.ring)) return p.zone
  }
  return null
}

if (!dbZones) {
  note('skipped — needs database credentials')
} else {
  const szRes = await fetch(
    `${url}/rest/v1/street_zones?city_id=eq.${cityId}&select=street_name,zone_name`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const streets = szRes.ok ? await szRes.json() : []
  if (!streets.length) note('no street_zones rows for this city — nothing to check against')
  else {
    const lats = polys.flatMap((p) => p.ring.map((c) => c[1]))
    const lngs = polys.flatMap((p) => p.ring.map((c) => c[0]))
    const pad = 0.02
    const q = `[out:json][timeout:120];(way["highway"]["name"](${Math.min(...lats) - pad},${Math.min(...lngs) - pad},${Math.max(...lats) + pad},${Math.max(...lngs) + pad}););out geom;`
    const cache = `/tmp/kerb-osm-${cityId}.json`
    let osm
    if (fs.existsSync(cache) && Date.now() - fs.statSync(cache).mtimeMs < 864e5) {
      osm = JSON.parse(fs.readFileSync(cache, 'utf8'))
    } else {
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      osm = await r.json()
      fs.writeFileSync(cache, JSON.stringify(osm))
    }
    const byName = new Map()
    for (const el of osm.elements ?? []) {
      const n = el.tags?.name
      if (!n || !el.geometry) continue
      const k = norm(n)
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k).push(...el.geometry.map((p) => [p.lon, p.lat]))
    }
    const missing = [], wrong = [], absent = []
    let good = 0
    for (const row of streets) {
      const k = norm(row.street_name)
      let pts = byName.get(k)
      if (!pts) {
        const cand = [...byName.keys()].find((x) => x.includes(k) || k.includes(x))
        pts = cand ? byName.get(cand) : null
      }
      if (!pts) { absent.push(row.street_name); continue }
      const found = pts.map(zoneAt).filter(Boolean)
      if (!found.length) missing.push(`${row.zone_name} · ${row.street_name}`)
      else if (!found.includes(row.zone_name)) wrong.push(`${row.street_name} — list: ${row.zone_name}, map: ${found[0]}`)
      else good++
    }
    const total = streets.length
    ok(`${good}/${total} streets fall in the zone street_zones says they should`)
    if (missing.length) {
      fail(`${missing.length} street(s) covered by no polygon`)
      missing.slice(0, 20).forEach((m) => note(m))
      if (missing.length > 20) note(`… and ${missing.length - 20} more`)
    }
    if (wrong.length) {
      fail(`${wrong.length} street(s) in a different zone than the list says`)
      wrong.forEach((w) => note(w))
    }
    if (absent.length) note(`${absent.length} not found in OSM under that name: ${absent.join(', ')}`)
  }
}

// ── street names ──────────────────────────────────────────────────────────────
console.log('\nLABELS')
const named = features.filter((f) => f.properties?.name).length
named === features.length
  ? ok('every feature carries a street name')
  : note(`${features.length - named} of ${features.length} features have no name — `
       + `"nearest paid parking is ~X away on ___" renders bare for those`)

console.log(`\n${problems ? `${problems} problem(s) to look at` : 'clean'}\n`)
process.exit(problems ? 1 : 0)
