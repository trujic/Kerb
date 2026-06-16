// ── BUILD BELGRADE ZONE GEOMETRY (APPROXIMATE) ────────────────────────────────
// IMPORTANT: Unlike Novi Sad (real OSM street geometry) and Niš (official My Maps
// polygons), Belgrade publishes its zone boundaries ONLY as a raster image:
//   https://www.parking-servis.co.rs/storage/8811/Zonski-sistem-parkiranja_20042026.jpg
// There is no official vector cadastre, and OpenStreetMap carries no parking-zone
// tags for Belgrade. So these polygons are APPROXIMATE — coarsely traced from that
// official image against known Belgrade landmarks. They are deliberately rough.
//
// Because of that, Belgrade is classified `cadastre_approx` (see useCityTier.ts):
// the map renders, but it is labelled "Approximate" with an explicit caveat, and
// the sign always wins. Do NOT promote Belgrade to `cadastre` or set the city's
// `verified` flag on the strength of this file.
//
// Run:  node scripts/build-belgrade-geometry.mjs
//
// Zone names MUST match scripts/seed-belgrade.mjs so the legend, Ask-AI resolver
// and sign scans line up.

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dir, '../public/zones/belgrade.json')

// Colours mirror seed-belgrade.mjs exactly.
const COLOR = {
  'Zone A — Purple': '#7C3AED',
  'Zone 1 — Red': '#DC2626',
  'Zone B — White': '#6B7280',
  'Zone 2 — Yellow': '#D97706',
  'Zone 3 — Green': '#16A34A',
  'Blue Zone — Unlimited': '#2563EB',
}

// Approximate rings, [lng, lat], traced from the official zone image against
// landmarks (Kalemegdan/Ušće, Trg Republike, Terazije, Slavija, Vračar, the Sava
// and Danube banks, Novi Beograd and Zemun). Coarse on purpose.
const RINGS = {
  // Historic core — Stari Grad centre (Knez Mihailova / Trg Republike / Terazije).
  'Zone A — Purple': [
    [20.4515, 44.8205], [20.4600, 44.8210], [20.4660, 44.8175],
    [20.4640, 44.8120], [20.4570, 44.8110], [20.4520, 44.8150],
  ],
  // North of the core — Dorćol toward the Danube.
  'Zone 1 — Red': [
    [20.4520, 44.8210], [20.4560, 44.8270], [20.4680, 44.8265],
    [20.4700, 44.8200], [20.4660, 44.8175], [20.4600, 44.8210],
  ],
  // North-east strip — lower Dorćol toward the port.
  'Zone B — White': [
    [20.4680, 44.8265], [20.4720, 44.8300], [20.4790, 44.8270],
    [20.4790, 44.8205], [20.4700, 44.8200],
  ],
  // South / south-west — Savski venac and Savamala toward the Sava.
  'Zone 2 — Yellow': [
    [20.4570, 44.8110], [20.4640, 44.8120], [20.4660, 44.8050],
    [20.4600, 44.8000], [20.4520, 44.8050], [20.4520, 44.8150],
  ],
  // Large outer ring — Vračar, Slavija, Neimar, toward Zvezdara fringe.
  'Zone 3 — Green': [
    [20.4640, 44.8120], [20.4660, 44.8175], [20.4790, 44.8160],
    [20.4900, 44.8050], [20.4850, 44.7900], [20.4700, 44.7850],
    [20.4600, 44.7950], [20.4660, 44.8050],
  ],
  // Blue zone lives across the rivers — Novi Beograd + Zemun (two patches,
  // emitted as separate Polygon features since the map doesn't render MultiPolygon).
  'Blue Zone — Unlimited': null, // built from BLUE_PATCHES below
}

const BLUE_PATCHES = [
  // Novi Beograd central blocks
  [[20.4050, 44.8050], [20.4300, 44.8150], [20.4350, 44.8000], [20.4200, 44.7900], [20.4000, 44.7950]],
  // Zemun centre
  [[20.4050, 44.8450], [20.4150, 44.8500], [20.4180, 44.8420], [20.4080, 44.8380]],
]

const close = (ring) => (
  ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring : [...ring, ring[0]]
)

const features = []
for (const [name, ring] of Object.entries(RINGS)) {
  if (!ring) continue
  features.push({
    type: 'Feature',
    properties: { name, zone: name, color: COLOR[name], approximate: true },
    geometry: { type: 'Polygon', coordinates: [close(ring)] },
  })
}
// Blue zone — one Polygon feature per river-crossing patch (map has no MultiPolygon).
for (const patch of BLUE_PATCHES) {
  features.push({
    type: 'Feature',
    properties: { name: 'Blue Zone — Unlimited', zone: 'Blue Zone — Unlimited', color: COLOR['Blue Zone — Unlimited'], approximate: true },
    geometry: { type: 'Polygon', coordinates: [close(patch)] },
  })
}

const fc = {
  type: 'FeatureCollection',
  properties: {
    approximate: true,
    source: 'Traced from parking-servis.co.rs official zone image (raster) — no official vector cadastre exists.',
  },
  features,
}

writeFileSync(OUT, JSON.stringify(fc))
console.log(`✓ Wrote ${features.length} approximate zone features → ${OUT}`)
console.log('  Reminder: Belgrade stays tier=cadastre_approx; these polygons are coarse, the sign wins.')
