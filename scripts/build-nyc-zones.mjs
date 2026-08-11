// ── NEW YORK METER RATE ZONES ─────────────────────────────────────────────────
// Unlike every other city here, nothing is traced, derived or guessed. New York
// publishes its meter rate zones as an open dataset with real geometry and the
// rate text on each feature, so this script does the only honest thing available:
// it downloads them and rewrites the properties into our shape.
//
//   Source: NYC Open Data — "Parking Meters - Citywide Rate Zones"
//           https://data.cityofnewyork.us/Transportation/Parking-Meters-Citywide-Rate-Zones/f72k-2u3b
//
// The zone names written here MUST match the zone names in
// scripts/data/new-york-city.json, or the resolver and Ask-AI will describe a
// zone the map cannot show.
//
// Run: node scripts/build-nyc-zones.mjs

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const SRC = 'https://data.cityofnewyork.us/resource/f72k-2u3b.json?$limit=500'
const OUT = resolve(__dir, '../public/zones/new-york-city.json')

// Zone code → the name and colour used in the city record. Anything the dataset
// returns that is not in here is a new zone the city added, and the script says
// so rather than silently dropping it or inventing a colour for it.
const ZONES = {
  'Zone M1': { name: 'Zone M1 — Financial District', color: '#B4232B' },
  'Zone M2': { name: 'Zone M2 — Manhattan Neighborhood', color: '#DC4B3E' },
  'Zone M3': { name: 'Zone M3 — 96th to 110th St', color: '#E6A700' },
  'Zone 1': { name: 'Zone 1 — Boerum Hill / Carroll Gardens / Cobble Hill', color: '#2F6FDB' },
  'Zone 2': { name: 'Zone 2 — Bronx Hub', color: '#7A5AF8' },
  'Zone 3': { name: 'Zone 3 — Outerborough', color: '#2FB36B' },
}

const round = (n) => Math.round(n * 1e5) / 1e5 // ~1 m; the file is served to phones

const roundGeom = (g) => {
  const walk = (c) =>
    typeof c[0] === 'number' ? [round(c[0]), round(c[1])] : c.map(walk)
  return { ...g, coordinates: walk(g.coordinates) }
}

const build = async () => {
  console.log('Fetching NYC rate zones…')
  const res = await fetch(SRC)
  if (!res.ok) throw new Error(`Source returned ${res.status}`)
  const rows = await res.json()
  console.log(`✓ ${rows.length} features`)

  const unknown = new Set()
  const features = []

  for (const r of rows) {
    if (!r.the_geom) continue
    const meta = ZONES[r.zone]
    if (!meta) { unknown.add(r.zone); continue }
    features.push({
      type: 'Feature',
      geometry: roundGeom(r.the_geom),
      properties: {
        // `name` is what the map labels; the borough is the useful half here,
        // since one rate zone spans several of them in pieces.
        name: r.boro_name ?? null,
        zone: meta.name,
        color: meta.color,
        // Kept verbatim from the city so the price on the map and the price in
        // the city record can always be traced to the same published string.
        rate: r.rate_zone ?? null,
      },
    })
  }

  if (unknown.size) {
    console.warn(`⚠ ${unknown.size} unmapped zone code(s): ${[...unknown].join(', ')}`)
    console.warn('  Add them to ZONES above and to scripts/data/new-york-city.json.')
  }

  const out = { type: 'FeatureCollection', features }
  writeFileSync(OUT, JSON.stringify(out))
  const mb = (JSON.stringify(out).length / 1024 / 1024).toFixed(2)
  console.log(`✓ Wrote ${features.length} features → public/zones/new-york-city.json (${mb} MB)`)

  const byZone = {}
  for (const f of features) byZone[f.properties.zone] = (byZone[f.properties.zone] ?? 0) + 1
  for (const [z, n] of Object.entries(byZone)) console.log(`   ${n.toString().padStart(3)} × ${z}`)
}

build().catch((e) => { console.error('Build failed:', e.message); process.exit(1) })
