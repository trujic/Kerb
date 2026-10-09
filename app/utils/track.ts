// ── COUNTING, NOT TRACKING ────────────────────────────────────────────────────
// A handful of named events so a launch can teach something: did people see a
// zone, open the SMS, scan a sign, come back a week later. The props here never
// carry a plate, a coordinate or a street — only the city and the kind of answer.
//
// Two places hear them. Kerb's own daily totals (/api/count, one row per day,
// event, city and label) always; Plausible, which keeps no cookies and no
// per-person trail, only once runtimeConfig.public.plausibleDomain is set.

type Props = Record<string, string | number | boolean>

const COUNT_URL = '/api/count'

// A beacon survives the page navigating away, which is exactly what happens on
// "SMS opened": the next thing the browser does is hand over to the composer.
// Not from a dev server, and not from automated browsers, whose runs would
// otherwise be most of the numbers.
const count = (name: string, props?: Props) => {
  if (import.meta.dev || navigator.webdriver) return
  try {
    const body = JSON.stringify({
      event: name,
      city: props?.city ?? 'unknown',
      kind: props?.kind ?? props?.answer ?? props?.zone ?? '',
    })
    const sent = navigator.sendBeacon?.(COUNT_URL, new Blob([body], { type: 'application/json' }))
    if (!sent) {
      fetch(COUNT_URL, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
        keepalive: true,
      }).catch(() => {})
    }
  } catch { /* counting must never break paying */ }
}

export const track = (name: string, props?: Props) => {
  if (!import.meta.client) return
  count(name, props)
  const p = (window as any).plausible
  if (typeof p !== 'function') return
  try {
    p(name, props ? { props } : undefined)
  } catch { /* counting must never break paying */ }
}
