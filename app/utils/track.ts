// ── COUNTING, NOT TRACKING ────────────────────────────────────────────────────
// A handful of named events so a launch can teach something: did people see a
// zone, open the SMS, scan a sign, come back a week later. Plausible keeps no
// cookies and no per-person trail; the props here never carry a plate, a
// coordinate or a street — only the city and the kind of answer given.
//
// A no-op until runtimeConfig.public.plausibleDomain is set (plugins/analytics).

type Props = Record<string, string | number | boolean>

export const track = (name: string, props?: Props) => {
  if (!import.meta.client) return
  const p = (window as any).plausible
  if (typeof p !== 'function') return
  try {
    p(name, props ? { props } : undefined)
  } catch { /* counting must never break paying */ }
}
