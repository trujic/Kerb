// ── PLATE SCAN ────────────────────────────────────────────────────────────────
// Read a licence plate off a photo so the user doesn't mistype it (a wrong plate =
// a blocked or wasted SMS payment). On-device OCR now, behind an engine interface
// so a vision model can slot in later. The result is ALWAYS editable — never
// auto-trusted with the user's money.

export interface PlateRead {
  plate: string | null   // normalized, e.g. "NS123AB", or null if nothing matched
  confidence: number     // 0..1
  raw: string
}

// Plate characters Tesseract is allowed to emit — no lowercase, no punctuation, so
// the engine can't drift into words and the format parse has clean input.
const PLATE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZČŠŽĐĆ0123456789'

// Format-aware OCR confusion fixes: a digit sitting in a letter slot is almost
// always the look-alike letter, and vice-versa. Applied per-slot, not globally.
const toLetters = (s: string) =>
  s.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B').replace(/2/g, 'Z')
const toDigits = (s: string) =>
  s.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2')

// Serbian plate: 2-letter region code · 3–4 digits · 1–2 letters (Latin, incl. ČŠŽĐĆ).
// Tolerant of OCR swapping look-alikes between the letter and digit sections, then
// re-validated per slot so we never return a malformed plate.
const parsePlate = (raw: string): string | null => {
  const t = raw.toUpperCase().replace(/[^A-ZČŠŽĐĆ0-9]/g, ' ')
  const m = t.match(/\b([A-ZČŠŽĐĆ0-9]{2})\s*([A-ZČŠŽĐĆ0-9]{3,4})\s*([A-ZČŠŽĐĆ0-9]{1,2})\b/)
  if (!m) return null
  const region = toLetters(m[1])
  const digits = toDigits(m[2])
  const suffix = toLetters(m[3])
  if (!/^[A-ZČŠŽĐĆ]{2}$/.test(region)) return null
  if (!/^\d{3,4}$/.test(digits)) return null
  if (!/^[A-ZČŠŽĐĆ]{1,2}$/.test(suffix)) return null
  return `${region}${digits}${suffix}`
}

// Grayscale + contrast-stretch + upscale. We don't binarise (uneven daylight would
// wipe the plate); we just give Tesseract more pixels per character and clean,
// high-contrast input — the single biggest lever without a plate detector.
const preprocess = (file: Blob, target = 1400): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const longest = Math.max(img.width, img.height)
      const k = Math.min(2, target / longest) // upscale small/distant plates, cap at 2×
      const w = Math.round(img.width * k)
      const h = Math.round(img.height * k)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas unsupported'))
      ctx.drawImage(img, 0, 0, w, h)
      const im = ctx.getImageData(0, 0, w, h)
      const d = im.data
      const lum = new Float32Array(w * h)
      let lo = 255, hi = 0
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        lum[p] = g; if (g < lo) lo = g; if (g > hi) hi = g
      }
      const span = Math.max(1, hi - lo)
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const v = ((lum[p] - lo) / span) * 255 // stretch to full range
        d[i] = d[i + 1] = d[i + 2] = v
      }
      ctx.putImageData(im, 0, 0)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('preprocess failed'))), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    img.src = url
  })

export const usePlateScan = (engine: 'ocr' | 'vision' = 'ocr') => {
  const readPlate = async (image: Blob): Promise<PlateRead> => {
    if (engine === 'vision') throw new Error('vision plate read not enabled yet')
    const Tesseract = (await import('tesseract.js')).default
    const prepped = await preprocess(image)

    const worker = await Tesseract.createWorker('eng')
    try {
      await worker.setParameters({ tessedit_char_whitelist: PLATE_CHARS })
      // PSM 11 = sparse text: find the plate even amid other scene text. Fall back to
      // PSM 6 (one uniform block) for a tight, fills-the-frame shot.
      let best: PlateRead = { plate: null, confidence: 0, raw: '' }
      for (const psm of ['11', '6']) {
        await worker.setParameters({ tessedit_pageseg_mode: psm as any })
        const { data } = await worker.recognize(prepped)
        const raw = data.text ?? ''
        const plate = parsePlate(raw)
        if (plate) return { plate, confidence: Math.min(1, (data.confidence ?? 0) / 100), raw }
        if (!best.raw) best = { plate: null, confidence: 0, raw }
      }
      return best
    } finally {
      await worker.terminate()
    }
  }

  return { readPlate }
}
