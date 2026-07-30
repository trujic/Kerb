// ── PAY METHOD ────────────────────────────────────────────────────────────────
// How a zone is paid, as data rather than an assumption.
//
// The whole pay surface was built on `sms:<shortcode>?body=<plate>`, which is
// true in Serbia and stops being true immediately outside it: Thessaloniki
// charges per minute through the ParkPal app, Belgrade publishes no shortcode at
// all, and plenty of cities only have machines at the kerb.
//
// A zone therefore declares a method and a target. The pay surface asks this
// what it can offer instead of assuming there is a shortcode — and when the
// answer is "nothing", it says so rather than rendering a button that cannot
// work. Belgrade has 28 traced polygons and no way to pay: that must read as a
// gap in our data, not as a broken app.

export type PayMethodKind = 'sms' | 'app' | 'kiosk' | 'none'

export interface PayAction {
  kind: PayMethodKind
  /** True when there is something to open — i.e. the UI may show a pay control. */
  actionable: boolean
  /** Ready-to-open URL for 'sms' and 'app'. */
  href: string | null
  /** What the driver is about to be handed to: a shortcode, an app name. */
  label: string | null
  /** Why there is no action, for the honest empty state. */
  reason?: 'kiosk' | 'unknown'
}

/**
 * Fill a deep-link template. Cities hand out wildly different link shapes, so the
 * target is stored as a template rather than assembled here:
 *   parkpal://park?sector={sector}&plate={plate}
 */
const fillTemplate = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars[k] ?? ''))

export const payActionFor = (
  zone: any,
  opts: { plate?: string | null; sector?: string | null } = {},
): PayAction => {
  const plate = opts.plate?.trim().toUpperCase() ?? ''
  // Zones predating the migration carry only sms_shortcode; treat that as SMS so
  // nothing regresses before every row has been backfilled.
  const kind: PayMethodKind = zone?.pay_method ?? (zone?.sms_shortcode ? 'sms' : 'none')
  const target: string | null = zone?.pay_target ?? zone?.sms_shortcode ?? null

  if (kind === 'sms' && target) {
    return { kind, actionable: true, href: smsHref(target, plate || null), label: target }
  }
  if (kind === 'app' && target) {
    return {
      kind,
      actionable: true,
      href: fillTemplate(target, { plate, zone: zone?.name ?? '', sector: opts.sector ?? '' }),
      label: zone?.pay_label ?? null,
    }
  }
  if (kind === 'kiosk') {
    return { kind, actionable: false, href: null, label: zone?.pay_label ?? null, reason: 'kiosk' }
  }
  return { kind: 'none', actionable: false, href: null, label: null, reason: 'unknown' }
}

/**
 * Hand off to whatever the zone uses. SMS keeps its anchor-click workaround (an
 * installed PWA drops ?body when the window navigates to an sms: URL); app links
 * open the same way, since a custom scheme has the same problem.
 */
export const openPayAction = (action: PayAction): void => {
  if (!import.meta.client || !action.href) return
  openSms(action.href)
}
