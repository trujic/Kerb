// ── READS THE FIRST SCREEN WAITS ON ──────────────────────────────────────────
// supabase-js retries a failed GET three times, pausing 1, 2 and 4 seconds. That
// is right for a blip and wrong for a phone with no signal: every read took about
// 7 s to give up, the boot made several in a row, and the copy kept on the phone,
// ready at once, arrived after 25 s. These reads try once, within BOOT_READ_MS,
// and the caller falls back to what it kept.

export const BOOT_READ_MS = 8000

/** An abort signal that fires after BOOT_READ_MS, where the browser has one. */
export const bootSignal = (): AbortSignal | undefined =>
  typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
    ? (AbortSignal as any).timeout(BOOT_READ_MS)
    : undefined

/** The phone says there is no network at all: asking it would only cost time. */
export const surelyOffline = (): boolean =>
  import.meta.client && typeof navigator !== 'undefined' && navigator.onLine === false
