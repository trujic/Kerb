// Pick a readable ink (text/icon) color for an arbitrary fill color.
// Zone colors come from city data, so the ink can't be hardcoded: white fails
// AA on every current zone fill (red 3.8:1, blue 3.5:1, gray 3.1:1, yellow 1.4:1).
const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (hex: string): number | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  )
}

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

const DARK_INK = '#16181C' // --bg: asphalt ink, matches the theme
const LIGHT_INK = '#F4F4F0' // --text

/** Ink color with the higher WCAG contrast against the given fill. */
export const inkOn = (fill: string | null | undefined): string => {
  const L = fill ? luminance(fill) : null
  if (L == null) return DARK_INK // non-hex (CSS var = accent yellow) → dark ink
  const dark = luminance(DARK_INK)!
  const light = luminance(LIGHT_INK)!
  return contrast(L, dark) >= contrast(L, light) ? DARK_INK : LIGHT_INK
}
