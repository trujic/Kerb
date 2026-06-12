// ── SIGN SCAN ─────────────────────────────────────────────────────────────────
// The physical sign is ground truth. A contributor photographs it where they're
// standing; we read the zone/price off the image, they confirm, and we store it
// geotagged. That confirmed report drops a verified pin on the map AND prefills
// the correct pay action (the SMS shortcode for the zone the sign actually shows).
//
// Read engine is pluggable: on-device OCR (Tesseract.js, free) now, with a slot to
// swap in a Claude-vision serverless read later — see `readSign`'s `engine`.

export interface ZoneDef {
  name: string
  color?: string
  price?: string
  sms_shortcode?: string
  rules?: string
}

export interface SignRead {
  rawText: string
  zone: ZoneDef | null   // best match against the city's zones, or null if unsure
  confidence: number     // 0..1
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
const matchZone = (rawText: string, zones: ZoneDef[]): { zone: ZoneDef | null; confidence: number } => {
  const text = normalize(rawText)
  const digits = text.replace(/[^0-9]/g, ' ')
  let best: ZoneDef | null = null
  let bestScore = 0

  for (const z of zones) {
    let score = 0
    if (z.sms_shortcode && new RegExp(`\\b${z.sms_shortcode}\\b`).test(digits)) score += 3

    const colorKey = z.name.toLowerCase().split(/\s+/)[0]
    const words = ZONE_SYNONYMS[colorKey] ?? [colorKey]
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(text))) score += 2

    const priceNum = z.price?.match(/\d+/)?.[0]
    if (priceNum && new RegExp(`\\b${priceNum}\\b`).test(digits)) score += 1

    if (score > bestScore) { bestScore = score; best = z }
  }

  // 3 = a single decisive signal (shortcode); ≥5 = corroborated. Cap at 1.
  const confidence = Math.min(1, bestScore / 5)
  return { zone: bestScore > 0 ? best : null, confidence }
}

// Downscale + re-encode to keep OCR fast and storage small.
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

  // Read the sign image into a structured zone match. OCR runs fully on-device.
  const readSign = async (image: Blob, zones: ZoneDef[]): Promise<SignRead> => {
    if (engine === 'claude') {
      // Upgrade slot: POST the image to a serverless Claude-vision read.
      throw new Error('Claude vision read not enabled yet')
    }
    const Tesseract = (await import('tesseract.js')).default
    const { data } = await Tesseract.recognize(image, 'eng')
    const rawText = data.text ?? ''
    const { zone, confidence } = matchZone(rawText, zones)
    return { rawText, zone, confidence }
  }

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
    const { data, error } = await supabase
      .from('sign_reports')
      .select('id, city_id, zone_name, zone_color, price, sms_shortcode, street_name, lat, lng, heading, photo_path, created_at')
      .eq('city_id', cityId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) { console.warn('[Kerb] loadForCity sign_reports failed (run migration-sign-reports.sql?):', error); return [] }

    return (data as SignReport[]).map((r) => ({
      ...r,
      photo_url: r.photo_path
        ? supabase.storage.from('sign-photos').getPublicUrl(r.photo_path).data.publicUrl
        : null,
    }))
  }

  return { readSign, submit, loadForCity, compressImage }
}
