// ── WHICH CITIES ARE PUBLIC ───────────────────────────────────────────────────
// A city is public once its numbers have been checked against the operator's own
// site — prices, SMS codes, limits, hours. An unchecked price or shortcode is
// worse than none: it sends money to the wrong place with Kerb's name on it.
//
// Everything else stays in the database (the editor, the scripts and the next
// verification need it) but the app answers for it as "not covered yet".
// Configured by runtimeConfig.public.liveCities; '*' lifts the gate, for work on
// a city that is not published.

export const useLiveCities = () => {
  const raw = String(useRuntimeConfig().public.liveCities ?? '').trim()
  const everything = raw === '*'
  const ids = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
  const isLive = (id?: string | null): boolean => !!id && (everything || ids.has(id))
  return { isLive }
}
