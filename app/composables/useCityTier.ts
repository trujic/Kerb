// ── CITY MAP TIER ─────────────────────────────────────────────────────────────
// A city's map is only ever as authoritative as its source. We never hand-draw
// zone polygons and present them as truth. Each city is classified by how good our
// backing data is — the city page renders a different (honest) experience per tier:
//
//   cadastre        — we have spatial zone geometry → an interactive reference map
//                     (still pointing at the official cadastre; the sign always wins)
//   cadastre_approx — we render a zone map, but it's coarsely traced from a raster
//                     source (no official vector cadastre). Same interactive map as
//                     cadastre, labelled "Approximate" with an explicit caveat.
//   street_registry — a street→zone lookup, not a drawn map
//   street_lists    — only coarse area lists; shown with an explicit "no official
//                     cadastre published" caveat + scan CTA
//   none            — no source we can back → "the sign, and your scans, are the map"
//
// Classification lives here as data (adding a city is a one-line entry), separate
// from the provenance text, which comes from the city's own official_url/last_updated
// so we never invent a source.

export type MapTier = 'cadastre' | 'cadastre_approx' | 'street_registry' | 'street_lists' | 'none'

const CITY_TIERS: Record<string, MapTier> = {
  'novi-sad': 'cadastre',         // per-street geometry in /zones/novi-sad.json
  'nis': 'cadastre',              // official zone-area polygons in /zones/nis.json
  // Belgrade publishes no vector map either, but it does publish the street list
  // itself — so the geometry is derived from that, not traced from the picture.
  'belgrade': 'cadastre_approx',
  // Zrenjanin has no zone map published at all — geometry is derived from the
  // official street list plus OSM parking areas, so it is a reasoned guess at
  // where those streets are, not a traced cadastre.
  'zrenjanin': 'cadastre_approx',
  // Thessaloniki publishes its own GeoJSON — per-space polygons straight from the
  // operator, not traced by us. The best source any city here has.
  'thessaloniki': 'cadastre',
  // New York publishes the meter rate zones as an open dataset with geometry and
  // the rate on every feature, refreshed by the city itself — nothing is traced
  // and nothing is derived. See scripts/build-nyc-zones.mjs.
  'new-york-city': 'cadastre',
}

// Why a city is only approximate differs by city, and the difference matters to
// the driver reading it. Belgrade's zones are derived from parking-servis's own
// street list — accurate to the house number — which is a different and far
// stronger claim than Zrenjanin's, and telling drivers both were "traced from an
// image" would understate one and overstate the other.
const APPROX_REASON: Record<string, string> = {
  belgrade:
    'built from the operator\u2019s own published street list, placed on OpenStreetMap street ' +
    'geometry and split at the house numbers the operator splits at. Where a street changes ' +
    'zone mid-block, the boundary is as precise as the addresses around it.',
  zrenjanin:
    'derived from the official street list plus OpenStreetMap parking areas \u2014 a reasoned ' +
    'estimate of where those streets are, not a traced map.',
}
const APPROX_FALLBACK =
  'coarsely traced from the official zone image \u2014 treat them as a rough guide.'

export const useCityTier = (slug: MaybeRefOrGetter<string | null | undefined>) => {
  const tier = computed<MapTier>(() => CITY_TIERS[toValue(slug) ?? ''] ?? 'none')
  const approxReason = computed(() => APPROX_REASON[toValue(slug) ?? ''] ?? APPROX_FALLBACK)
  return { tier, approxReason }
}
