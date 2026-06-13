// ── CITY MAP TIER ─────────────────────────────────────────────────────────────
// A city's map is only ever as authoritative as its source. We never hand-draw
// zone polygons and present them as truth. Each city is classified by how good our
// backing data is — the city page renders a different (honest) experience per tier:
//
//   cadastre        — we have spatial zone geometry → an interactive reference map
//                     (still pointing at the official cadastre; the sign always wins)
//   street_registry — a street→zone lookup, not a drawn map
//   street_lists    — only coarse area lists; shown with an explicit "no official
//                     cadastre published" caveat + scan CTA
//   none            — no source we can back → "the sign, and your scans, are the map"
//
// Classification lives here as data (adding a city is a one-line entry), separate
// from the provenance text, which comes from the city's own official_url/last_updated
// so we never invent a source.

export type MapTier = 'cadastre' | 'street_registry' | 'street_lists' | 'none'

const CITY_TIERS: Record<string, MapTier> = {
  'novi-sad': 'cadastre',       // per-street geometry in /zones/novi-sad.json
  'belgrade': 'street_registry', // official searchable street registry exists
}

export const useCityTier = (slug: MaybeRefOrGetter<string | null | undefined>) => {
  const tier = computed<MapTier>(() => CITY_TIERS[toValue(slug) ?? ''] ?? 'none')
  return { tier }
}
