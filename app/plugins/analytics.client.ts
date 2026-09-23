// Loads Plausible only when a domain is configured; otherwise nothing is fetched
// and track() stays a no-op. See utils/track.ts for what is counted and why.
const FIRST_SEEN_KEY = 'kerb_first_seen'
const RETURN_KEY = 'kerb_return_week'
const DAY_MS = 86_400_000

export default defineNuxtPlugin(() => {
  const domain = String(useRuntimeConfig().public.plausibleDomain || '').trim()
  if (!domain) return

  const w = window as any
  // Queue calls made before the script arrives.
  w.plausible = w.plausible || function (...args: any[]) { (w.plausible.q = w.plausible.q || []).push(args) }
  const s = document.createElement('script')
  s.defer = true
  s.dataset.domain = domain
  s.src = 'https://plausible.io/js/script.js'
  document.head.appendChild(s)

  // "Came back after a week or more", counted at most once per week per device,
  // without an identifier: the only memory is a date in this browser.
  try {
    const now = Date.now()
    const first = Number(localStorage.getItem(FIRST_SEEN_KEY))
    if (!first) {
      localStorage.setItem(FIRST_SEEN_KEY, String(now))
    } else if (now - first >= 7 * DAY_MS) {
      const week = String(Math.floor(now / (7 * DAY_MS)))
      if (localStorage.getItem(RETURN_KEY) !== week) {
        localStorage.setItem(RETURN_KEY, week)
        track('Returned after 7+ days')
      }
    }
  } catch { /* storage blocked — skip the return count */ }
})
