// ── SIGN SCAN ─────────────────────────────────────────────────────────────────
// The physical sign is ground truth. A contributor photographs it where they're
// standing; we read the zone/price off the image, they confirm, and we store it
// geotagged. That confirmed report drops a verified pin on the map AND prefills
// the correct pay action (the SMS shortcode for the zone the sign actually shows).
//
// Read engine is pluggable. `claude` posts the frame to /api/read-sign for a vision
// read; `ocr` runs Tesseract on-device. Claude is the default because Tesseract is
// running an English model over signs that are half Cyrillic, shot at an angle in
// direct sun — and its failure mode is a confident wrong digit, which is the single
// failure this product cannot afford. OCR stays as the offline/no-key fallback: a
// degraded read still beats a blocked scan, and every read still needs confirming.

export interface ZoneDef {
  name: string
  color?: string
  price?: string
  sms_shortcode?: string
  rules?: string
}

export interface SignRead {
  rawText: string
  zone: ZoneDef | null   // best match against the city's zones (from OCR text)
  confidence: number     // 0..1
  fields: SignFields     // per-field read quality (drives amber/red + pre-fill block)
  color: { zone: ZoneDef | null; confidence: number } | null // dominant-colour match
  // How the colour read lines up with the text read:
  corroboration: 'agree' | 'conflict' | 'color-only' | 'none'
  notSign: boolean       // the frame carries no parking-tariff content (likely another sign)
}

// 'read' = trust it · 'low' = show amber, double-check · 'unreadable' = red, can't trust
export type FieldState = 'read' | 'low' | 'unreadable'
export interface SignField { value: string | null; state: FieldState }
export interface SignFields {
  zone: SignField
  price: SignField
  limit: SignField
  code: SignField
  hours: SignField
}

export interface SignReport {
  id: string
  city_id: string | null
  zone_name: string
  zone_color: string | null
  price: string | null
  sms_shortcode: string | null
  street_name: string | null
  lat: number
  lng: number
  heading: number | null   // compass heading at capture — direction the sign faced
  photo_path: string | null
  photo_url?: string | null
  created_at: string
}

// Serbian (Latin) words that appear on the colored zone signs, keyed by the
// English colour in our zone names ("Extra Zone", "Red Zone", …).
const ZONE_SYNONYMS: Record<string, string[]> = {
  extra: ['extra', 'ekstra'],
  red:   ['red', 'crvena', 'crvenoj', 'crveno', 'crvene'],
  blue:  ['blue', 'plava', 'plavoj', 'plavo', 'plave'],
  white: ['white', 'bela', 'beloj', 'belo', 'bele', 'bijela'],
  green: ['green', 'zelena', 'zeleno'],
  yellow:['yellow', 'zuta', 'zuto'],
}

const normalize = (s: string) =>
  s.toLowerCase()
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')

// Score each zone by the strongest signals on a parking sign:
//   shortcode digits (3) > colour word (2) > price number (1).
// Only the shortcode and colour word *identify* a zone; the price digit merely
// corroborates one — zones share price numbers, and stray digits (time limits,
// phone numbers) coincide too. So we track the identifying signals separately and
// refuse to assert a zone from a price match alone.
const matchZone = (rawText: string, zones: ZoneDef[]): { zone: ZoneDef | null; confidence: number } => {
  const text = normalize(rawText)
  const digits = text.replace(/[^0-9]/g, ' ')
  let best: ZoneDef | null = null
  let bestScore = 0
  let bestIdScore = 0 // identifying signal only (shortcode + colour word)

  for (const z of zones) {
    let idScore = 0
    if (z.sms_shortcode && new RegExp(`\\b${z.sms_shortcode}\\b`).test(digits)) idScore += 3

    const colorKey = z.name.toLowerCase().split(/\s+/)[0]
    const words = ZONE_SYNONYMS[colorKey] ?? [colorKey]
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(text))) idScore += 2

    const priceNum = z.price?.match(/\d+/)?.[0]
    const priceHit = priceNum ? new RegExp(`\\b${priceNum}\\b`).test(digits) ? 1 : 0 : 0

    const score = idScore + priceHit
    if (score > bestScore) { bestScore = score; bestIdScore = idScore; best = z }
  }

  // Require an identifying signal (colour word or shortcode) — never assert a zone
  // off a coincidental price digit, which would pre-fill the wrong payment.
  if (bestIdScore < 2) return { zone: null, confidence: 0 }

  // 3 = a single decisive signal (shortcode); ≥5 = corroborated. Cap at 1.
  const confidence = Math.min(1, bestScore / 5)
  return { zone: best, confidence }
}

// Is this actually a parking-tariff sign — not just any sign that happens to share
// the zone colours (a blue mandatory sign, a red stop sign, a green motorway sign)?
// Decided by CONTENT, never colour: a parking sign carries a price, an hours range,
// an SMS pay-number, or parking words. Colour alone can't tell them apart, so we
// require this textual evidence before we trust a read or pre-fill any payment.
const PARKING_WORDS = [
  'parking', 'parkiranje', 'naplata', 'zona', 'zone', 'sms', 'sat', 'cas', 'min',
  ...Object.values(ZONE_SYNONYMS).flat(), // zone colour words double as evidence
]
const looksLikeParkingSign = (rawText: string): boolean => {
  const text = normalize(rawText)
  const digits = text.replace(/[^0-9]/g, ' ')
  if (/\d{2,4}\s*(din|rsd)/.test(text)) return true                              // a price
  if (/\b[89]\d{3}\b/.test(digits)) return true                                  // an SMS shortcode
  if (/\b([01]?\d|2[0-4])\s*[-–]\s*([01]?\d|2[0-4])\b/.test(text)) return true    // an hours range
  let hits = 0
  for (const w of PARKING_WORDS) if (new RegExp(`\\b${w}`).test(text)) hits++     // ≥2 parking words
  return hits >= 2
}

// ── Colour corroboration ──────────────────────────────────────────────────────
// The signs are colour-coded, so the dominant saturated colour is an independent
// check on the OCR text. Strong for Blue/Red/Extra; deliberately inconclusive for
// the unsaturated White/grey zone (we don't pretend to read a colour that isn't there).
const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHsv = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60; if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}
const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

const detectColor = (image: Blob, zones: ZoneDef[]): Promise<{ zone: ZoneDef | null; confidence: number } | null> =>
  new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(image)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const S = 50
      const canvas = document.createElement('canvas')
      canvas.width = S; canvas.height = S
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0, S, S)
      let data: Uint8ClampedArray
      try { data = ctx.getImageData(0, 0, S, S).data } catch { return resolve(null) }

      // Sample the CENTRE box only — keeps sky/building/asphalt at the edges from
      // hijacking the colour (a sign shot against blue sky must not read as "Blue").
      const lo = Math.floor(S * 0.25), hi = Math.ceil(S * 0.75)
      let sr = 0, sg = 0, sb = 0, n = 0
      const total = (hi - lo) * (hi - lo)
      for (let y = lo; y < hi; y++) {
        for (let x = lo; x < hi; x++) {
          const i = (y * S + x) * 4
          const { s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2])
          if (s > 0.35 && v > 0.2) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++ }
        }
      }
      if (n / total < 0.08) return resolve(null) // mostly unsaturated → can't tell from colour
      const dom = rgbToHsv(sr / n, sg / n, sb / n)

      // Nearest zone by hue (only zones that actually have a saturated colour).
      let best: ZoneDef | null = null, bestD = Infinity
      for (const z of zones) {
        const rgb = z.color ? hexToRgb(z.color) : null
        if (!rgb) continue
        const zh = rgbToHsv(...rgb)
        if (zh.s < 0.25) continue // skip white/grey targets
        const d = hueDist(dom.h, zh.h)
        if (d < bestD) { bestD = d; best = z }
      }
      if (!best || bestD > 45) return resolve(null) // no confident colour match
      resolve({ zone: best, confidence: Math.max(0, 1 - bestD / 60) })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })

// The Claude read names the sign's colour band in words rather than pixels, so it
// resolves through the same synonym table the text match uses. Unlike `detectColor`
// this cannot be fooled by blue sky behind the sign — the model was looking at the
// board, not at the frame's average hue.
const matchColorWord = (word: string, zones: ZoneDef[]): { zone: ZoneDef | null; confidence: number } | null => {
  const w = normalize(word).trim()
  if (!w) return null
  for (const z of zones) {
    const key = z.name.toLowerCase().split(/\s+/)[0]
    const words = ZONE_SYNONYMS[key] ?? [key]
    if (key === w || words.includes(w)) return { zone: z, confidence: 0.8 }
  }
  return null
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    // readAsDataURL gives "data:image/jpeg;base64,AAAA…" — the API wants the payload.
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => reject(new Error('read failed'))
    fr.readAsDataURL(blob)
  })

// Downscale + re-encode to keep the read fast, the upload small, and vision cost
// proportional to pixels rather than to whatever the phone camera produced.
const compressImage = (file: Blob, maxDim = 1280, quality = 0.82): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas unsupported'))
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('compress failed'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    img.src = url
  })

export const useSignScan = (engine: 'ocr' | 'claude' = 'ocr') => {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const userId = computed(() => (user.value as any)?.id ?? (user.value as any)?.sub ?? null)

  // Pull each rule field off the raw OCR with its own read quality.
  const parseFields = (rawText: string, matched: ZoneDef | null, confidence: number): SignFields => {
    const text = normalize(rawText)
    const digits = text.replace(/[^0-9]/g, ' ')

    const priceM = rawText.match(/(\d{2,4})\s*(rsd|din|дин)/i)
    const price = priceM ? `${priceM[1]} RSD` : (matched?.price ?? null)
    const limitM = rawText.match(/(\d{2,3})\s*min/i)
    const codeM = digits.match(/\b(8\d{3})\b/)
    const code = codeM ? codeM[1] : null
    const hoursM = rawText.match(/\b([01]?\d|2[0-4])\s*[-–]\s*([01]?\d|2[0-4])\b/)

    const zoneState: FieldState = confidence >= 0.6 ? 'read' : confidence > 0 ? 'low' : 'unreadable'
    const codeState: FieldState = code
      ? (matched?.sms_shortcode && code === matched.sms_shortcode ? 'read' : 'low')
      : 'unreadable'

    return {
      zone:  { value: matched?.name ?? null, state: zoneState },
      price: { value: price, state: price ? (priceM ? 'read' : 'low') : 'unreadable' },
      limit: { value: limitM ? `${limitM[1]} min` : null, state: limitM ? 'read' : 'unreadable' },
      code:  { value: code, state: codeState },
      hours: { value: hoursM ? `${hoursM[1]}–${hoursM[2]}` : null, state: hoursM ? 'read' : 'unreadable' },
    }
  }

  const UNREADABLE: SignField = { value: null, state: 'unreadable' }
  const blankFields = (): SignFields => ({
    zone: { ...UNREADABLE }, price: { ...UNREADABLE }, limit: { ...UNREADABLE },
    code: { ...UNREADABLE }, hours: { ...UNREADABLE },
  })

  // Claude vision read. Returns null on any failure — no key, offline, rate limit,
  // a refusal — so the caller can drop to OCR rather than lose the scan.
  const readViaClaude = async (image: Blob): Promise<{
    fields: SignFields; rawText: string; notSign: boolean; dominantColor: string | null
  } | null> => {
    try {
      // Smaller than the stored photo: vision cost scales with pixels, and a sign
      // filling the frame is legible well below the resolution worth keeping.
      const small = await compressImage(image, 1024, 0.8)
      const base64 = await blobToBase64(small)
      const res = await $fetch<any>('/api/read-sign', {
        method: 'POST',
        body: { image: base64, mediaType: 'image/jpeg' },
      })
      if (!res?.ok || !res.read) return null

      const r = res.read
      const f = (x: any): SignField => ({
        value: x?.value ?? null,
        // A value the model reported without a state it trusts is not a value.
        state: x?.value ? (x.state ?? 'low') : 'unreadable',
      })
      return {
        rawText: String(r.rawText ?? ''),
        notSign: !!r.notSign,
        dominantColor: r.dominantColor ?? null,
        fields: {
          zone: f(r.zone), price: f(r.price), limit: f(r.limit),
          code: f(r.code), hours: f(r.hours),
        },
      }
    } catch {
      return null
    }
  }

  // Read the sign image into a structured per-field read.
  const readSign = async (image: Blob, zones: ZoneDef[]): Promise<SignRead> => {
    if (engine === 'claude') {
      const v = await readViaClaude(image)
      if (v) return finishRead(v.rawText, v.notSign, v.dominantColor, zones, image, v.fields)
      // Fall through to on-device OCR: a weaker read the user must confirm anyway
      // beats telling someone standing at the kerb that scanning is unavailable.
    }
    const Tesseract = (await import('tesseract.js')).default
    const { data } = await Tesseract.recognize(image, 'eng')
    const rawText = data.text ?? ''

    return finishRead(rawText, false, null, zones, image)
  }

  // Everything after the raw read, shared by both engines: the not-a-sign gate, the
  // deterministic zone match, and colour corroboration. Keeping this common is the
  // point — whichever engine read the pixels, the decision about WHICH zone this is
  // comes from the city's registry, never from the reader.
  const finishRead = async (
    rawText: string,
    modelSaysNotSign: boolean,
    dominantColor: string | null,
    zones: ZoneDef[],
    image: Blob,
    modelFields?: SignFields,
  ): Promise<SignRead> => {
    // Gate on content first: if the frame carries no parking-tariff text, it's some
    // other sign that merely shares a colour. Refuse to read a zone off colour alone —
    // that's exactly how a blue road sign would masquerade as the Blue zone.
    if (modelSaysNotSign || !looksLikeParkingSign(rawText)) {
      return {
        rawText, zone: null, confidence: 0, color: null,
        corroboration: 'none', notSign: true, fields: blankFields(),
      }
    }

    const { zone, confidence } = matchZone(rawText, zones)
    const fields = modelFields ?? parseFields(rawText, zone, confidence)

    // The model reads the sign's own wording; the registry names the zone. Where the
    // text matched a known zone, show that name so the pay action and the panel agree.
    if (zone && fields.zone.state !== 'unreadable') fields.zone.value = zone.name
    if (!zone && fields.zone.state === 'read') fields.zone.state = 'low' // legible, but not a zone we know

    // Independent colour read, then corroborate it against the text read. Colour only
    // ranks WHICH zone now that the text has confirmed this is a parking sign.
    const color = dominantColor
      ? matchColorWord(dominantColor, zones)
      : await detectColor(image, zones)
    let corroboration: SignRead['corroboration'] = 'none'
    if (color?.zone && zone) corroboration = color.zone.name === zone.name ? 'agree' : 'conflict'
    else if (color?.zone && !zone) corroboration = 'color-only'

    if (corroboration === 'agree') {
      fields.zone.state = 'read' // text + colour agree → trust it
    } else if (corroboration === 'conflict' && fields.zone.state === 'read') {
      fields.zone.state = 'low'  // they disagree → don't trust either blindly
    } else if (corroboration === 'color-only' && fields.zone.state === 'unreadable') {
      fields.zone = { value: color!.zone!.name, state: 'low' } // colour-derived, double-check
    }

    return { rawText, zone, confidence, fields, color, corroboration, notSign: false }
  }

  // Guests get a couple of free scans; beyond that we nudge to an account (Plus =
  // unlimited, once tiers ship). Counted on-device — best-effort, not a hard wall.
  const FREE_SCANS = 2
  const SCAN_KEY = 'kerbo_scans_used'
  const scansUsed = () => (import.meta.client ? Number(localStorage.getItem(SCAN_KEY) || '0') : 0)
  const incScan = () => { if (import.meta.client) localStorage.setItem(SCAN_KEY, String(scansUsed() + 1)) }

  // Persist the confirmed scan: upload the photo, insert the geotagged report.
  // Returns the stored report (with a public photo URL) so the caller can pin it.
  const submit = async (p: {
    cityId: string
    zone: ZoneDef
    street?: string | null
    lat: number
    lng: number
    accuracy?: number | null
    heading?: number | null
    rawText?: string | null
    confidence?: number | null
    photo: Blob
  }): Promise<SignReport> => {
    const path = `${p.cityId}/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await supabase
      .storage.from('sign-photos')
      .upload(path, p.photo, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (upErr) throw upErr

    const { data, error } = await supabase
      .from('sign_reports')
      .insert({
        user_id: userId.value,
        city_id: p.cityId,
        zone_name: p.zone.name,
        zone_color: p.zone.color ?? null,
        price: p.zone.price ?? null,
        sms_shortcode: p.zone.sms_shortcode ?? null,
        street_name: p.street ?? null,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy ?? null,
        heading: p.heading ?? null,
        photo_path: path,
        raw_text: p.rawText ?? null,
        source: engine,
        confidence: p.confidence ?? null,
      })
      .select()
      .single()
    if (error) throw error

    const { data: pub } = supabase.storage.from('sign-photos').getPublicUrl(path)
    return { ...(data as SignReport), photo_url: pub.publicUrl }
  }

  // Recent confirmed signs for a city — the verified pins drawn on the map.
  const loadForCity = async (cityId: string, limit = 200): Promise<SignReport[]> => {
    const BASE = 'id, city_id, zone_name, zone_color, price, sms_shortcode, street_name, lat, lng, heading, photo_path, created_at'
    const query = (cols: string) => supabase
      .from('sign_reports')
      .select(cols)
      .eq('city_id', cityId)
      .order('created_at', { ascending: false })
      .limit(limit)
    let { data, error } = await query(`${BASE}, fixed_lat, fixed_lng`)
    // Until migration-sign-positions.sql has run there are no fixed_* columns, and
    // asking for them failed the whole query — every pin on the map vanished over
    // a correction feature nobody had used yet. Ask again without them.
    if (error?.code === '42703') ({ data, error } = await query(BASE))
    if (error) { console.warn('[Kerb] loadForCity sign_reports failed (run migration-sign-reports.sql?):', error); return [] }

    return (data as SignReport[]).map((r: any) => ({
      ...r,
      // A hand-corrected position wins over the capture point. lat/lng from a phone
      // between tall buildings is routinely tens of metres out, which is the width
      // of a zone boundary — the pin then argues with the sign it is showing.
      // Corrections are made in the zone editor; the capture point stays on the row.
      lat: r.fixed_lat ?? r.lat,
      lng: r.fixed_lng ?? r.lng,
      photo_url: r.photo_path
        ? supabase.storage.from('sign-photos').getPublicUrl(r.photo_path).data.publicUrl
        : null,
    }))
  }

  return { readSign, submit, loadForCity, compressImage, FREE_SCANS, scansUsed, incScan }
}
