// Switch to the visitor's language only once the page has hydrated. The server
// (or the prerender) already chose one; changing it during hydration is what made
// every page log a mismatch. A preference that differs becomes a plain re-render.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:suspense:resolve', () => {
    const want = preferredLang()
    if (!want) return
    const { lang, setLang } = useLang()
    if (lang.value !== want) setLang(want)
  })
})
