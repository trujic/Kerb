// ── ALWAYS-LATEST ──────────────────────────────────────────────────────────────
// An installed/standalone PWA resumes its old in-memory instance when you reopen
// the home-screen icon instead of doing a fresh navigation — so it can keep
// running a stale build indefinitely (iOS especially). Our service worker is
// push-only and caches nothing, so nothing else triggers an update.
//
// This plugin closes that gap with NO caching: Nuxt writes the current build id
// to /_nuxt/builds/latest.json on every deploy, so when the app is brought to the
// foreground we compare it to the running build and do a one-shot reload if it
// changed. The user always gets the latest version on reopen.

export default defineNuxtPlugin(() => {
  if (import.meta.dev) return // dev rebuilds constantly; only guard production

  const currentBuild = useRuntimeConfig().app.buildId
  const RELOAD_GUARD = 'kerb_reloaded_for' // prevents a reload loop if something's off
  let reloading = false
  let lastCheck = 0

  const checkForUpdate = async () => {
    if (reloading || document.visibilityState !== 'visible') return
    if (Date.now() - lastCheck < 30_000) return // throttle
    lastCheck = Date.now()
    try {
      const latest = await $fetch<{ id?: string }>('/_nuxt/builds/latest.json', {
        query: { _: Date.now() }, // bypass any intermediary HTTP cache
      })
      if (!latest?.id || latest.id === currentBuild) return
      if (sessionStorage.getItem(RELOAD_GUARD) === latest.id) return // already tried — don't loop
      sessionStorage.setItem(RELOAD_GUARD, latest.id)
      reloading = true
      window.location.reload()
    } catch { /* offline or not found — ignore */ }
  }

  // Reopening the PWA / switching back to the tab is the main update moment.
  document.addEventListener('visibilitychange', checkForUpdate)
  window.addEventListener('focus', checkForUpdate)

  // A long-lived open session still picks up new deploys.
  setInterval(checkForUpdate, 5 * 60_000)

  // A failed chunk preload means this build's assets are gone (a deploy happened
  // mid-session) — reload to fetch the current build.
  window.addEventListener('vite:preloadError', () => {
    if (!reloading) { reloading = true; window.location.reload() }
  })

  checkForUpdate()
})
