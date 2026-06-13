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

// Serbian plate: 2-letter region code · 3–4 digits · 1–2 letters (Latin, incl. ČŠŽĐĆ).
const parsePlate = (raw: string): string | null => {
  const t = raw.toUpperCase().replace(/[^A-ZČŠŽĐĆ0-9]/g, ' ')
  const m = t.match(/([A-ZČŠŽĐĆ]{2})\s*(\d{3,4})\s*([A-ZČŠŽĐĆ]{1,2})/)
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

// Downscale so OCR is fast and the camera frame isn't huge.
const compress = (file: Blob, maxDim = 1000, quality = 0.85): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas unsupported'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress failed'))), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    img.src = url
  })

export const usePlateScan = (engine: 'ocr' | 'vision' = 'ocr') => {
  const readPlate = async (image: Blob): Promise<PlateRead> => {
    if (engine === 'vision') throw new Error('vision plate read not enabled yet')
    const Tesseract = (await import('tesseract.js')).default
    const small = await compress(image)
    const { data } = await Tesseract.recognize(small, 'eng')
    const raw = data.text ?? ''
    const plate = parsePlate(raw)
    // Tesseract's confidence is for the whole read; only surface it when we matched.
    return { plate, confidence: plate ? Math.min(1, (data.confidence ?? 0) / 100) : 0, raw }
  }

  return { readPlate }
}
