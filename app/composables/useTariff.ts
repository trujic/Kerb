// ── TARIFF ────────────────────────────────────────────────────────────────────
// What a zone costs, as numbers rather than a sentence.
//
// `price` was a display string — "60 RSD/h", "120 RSD / 30 min", "70→210 RSD/h",
// "Pay per hour via app/SMS". You cannot compute three hours from that, convert
// a currency for a visitor, or compare two zones. Now the amount, the currency
// and the interval it buys are separate fields.
//
// The string stays authoritative for whatever the numbers cannot hold: Niš's Red
// Zone doubles into the second hour, Belgrade's Blue has no published rate at
// all. Where the two disagree, the string is what a human wrote and wins on
// screen; the numbers are only ever used where a number is genuinely needed.

export interface Tariff {
  amount: number | null
  currency: string | null
  minutes: number | null       // what `amount` buys — 60 = per hour, 1 = per minute
  display: string | null       // the human string, always preferred for display
  progressive: boolean         // rate changes with duration; totals are estimates
}

const CURRENCY_MINOR: Record<string, number> = { RSD: 0, EUR: 2, HRK: 2, BAM: 2 }

export const readTariff = (zone: any): Tariff => {
  const display: string | null = zone?.price ?? null
  const amount = zone?.price_amount != null ? Number(zone.price_amount) : null
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: zone?.price_currency ?? null,
    minutes: zone?.price_minutes != null ? Number(zone.price_minutes) : null,
    display,
    // "70→210 RSD/h" and friends: the first number is real but does not scale.
    progressive: /[→>–-]\s*\d/.test(display ?? '') && !/\d+\s*[-–]\s*\d+\s*min/i.test(display ?? ''),
  }
}

/** Format an amount in a zone's currency, without inventing decimals RSD never shows. */
export const formatMoney = (amount: number, currency: string | null, locale = 'sr-RS'): string => {
  const cur = currency ?? 'RSD'
  const digits = CURRENCY_MINOR[cur] ?? 2
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
  return `${n} ${cur}`
}

/**
 * What `minutes` of parking costs, or null when it cannot be known.
 *
 * Returns null rather than a guess for progressive tariffs and for zones with no
 * published amount — a confident wrong total is worse than an honest blank,
 * since this is the number someone decides to park on.
 */
export const costFor = (t: Tariff, minutes: number): number | null => {
  if (t.amount == null || !t.minutes || t.progressive) return null
  return (t.amount / t.minutes) * minutes
}

/** The zone's headline rate, e.g. "60 RSD/h" — the human string when there is one. */
export const rateLabel = (t: Tariff, locale = 'sr-RS'): string | null => {
  if (t.display) return t.display
  if (t.amount == null || !t.minutes) return null
  const money = formatMoney(t.amount, t.currency, locale)
  if (t.minutes === 60) return `${money}/h`
  if (t.minutes === 1) return `${money}/min`
  return `${money} / ${t.minutes} min`
}
