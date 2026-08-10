// ── ADD TO HOME SCREEN ────────────────────────────────────────────────────────
// Installing is not a vanity metric here, it is the difference between an app
// that works at the kerb and one that does not: on iPhone the Notification API
// does not exist at all until Kerbo is on the home screen, so a driver in Safari
// cannot be reminded of anything. It also survives being closed far longer,
// which is what the offline alarms depend on.
//
// The two platforms could not be less alike. Chrome fires beforeinstallprompt
// and lets us install on a tap. Safari has no API whatsoever — the only route is
// the driver doing it by hand through the Share sheet, so all iOS can be offered
// is a clear instruction. Anything shaped like an install button on iOS would be
// a button that cannot work.

/**
 * Chrome's deferred prompt. Module scope because the event fires once and early,
 * usually before any component that wants it has mounted — it must be caught
 * then or it is gone for that page life. See plugins/install-prompt.client.ts.
 */
let deferred: any = null

export const captureInstallPrompt = (e: any) => { deferred = e }

const DISMISS_KEY = 'kerbo_a2hs_dismissed'

export const useInstallPrompt = () => {
  /** Set by the plugin the moment Chrome offers the prompt. */
  const offered = useState('kerb-install-offered', () => false)
  const installed = useState('kerb-install-done', () => false)
  const dismissed = useState('kerb-install-dismissed', () => true)
  const isIos = useState('kerb-install-ios', () => false)

  const standalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true

  onMounted(() => {
    const ua = navigator.userAgent
    // iPadOS reports itself as a Mac; the touch count is the giveaway.
    isIos.value =
      /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    // Running from the home screen already answers the question, whatever any
    // stored flag says.
    installed.value = standalone()
    dismissed.value = localStorage.getItem(DISMISS_KEY) === '1'
    window.addEventListener('appinstalled', () => { installed.value = true })
  })

  /** Chrome can install on a tap. */
  const canPrompt = computed(() => offered.value && !installed.value && !dismissed.value)
  /** iOS can only be told how. */
  const needsSteps = computed(() => isIos.value && !installed.value && !dismissed.value)
  const visible = computed(() => canPrompt.value || needsSteps.value)

  const dismiss = () => {
    dismissed.value = true
    if (import.meta.client) localStorage.setItem(DISMISS_KEY, '1')
  }

  const install = async () => {
    if (!deferred) return false
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    offered.value = false
    if (outcome === 'accepted') installed.value = true
    // Chrome will not re-offer the prompt in this page life, so a "no" here is
    // an answer, not a postponement — the card should not sit there dead.
    else dismiss()
    return outcome === 'accepted'
  }

  return { visible, canPrompt, needsSteps, installed, install, dismiss }
}
