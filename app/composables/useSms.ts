// SMS composer handoff — shared by the dashboard and the city page so the
// platform quirks live in one place.

// Body-prefill separator differs by platform: iOS wants '&body=', Android
// (and most others) want '?body='. Getting this wrong silently drops the plate.
export const smsHref = (shortcode: string, plate?: string | null): string => {
  const clean = plate?.trim().toUpperCase()
  if (!clean) return `sms:${shortcode}`
  const ua = import.meta.client ? navigator.userAgent : ''
  const sep = /iP(hone|ad|od)/i.test(ua) ? '&' : '?'
  return `sms:${shortcode}${sep}body=${encodeURIComponent(clean)}`
}

// Open the SMS composer via a synthesized anchor click rather than location.href.
// In an installed PWA on Android, navigating the window to an sms: scheme can
// drop the ?body query; a real link click hands the intent over intact.
export const openSms = (url: string): void => {
  if (!import.meta.client) return
  const a = document.createElement('a')
  a.href = url
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
