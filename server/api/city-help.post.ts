// ── AI city help (unsupported cities) ───────────────────────────────────────────
// When GPS lands in a city Kerb has no verified data for, we offer an AI
// orientation: how parking generally works, the zones, and which apps pay for it.
//
//   POST /api/city-help   { city, lat?, lng? }
//
// This is explicitly UNVERIFIED guidance, never authoritative Kerb data, and it
// never produces a pay action. It runs provider-agnostically: with no key set it
// returns a labelled stub; set GEMINI_API_KEY to get live, web-grounded answers.

interface CityHelp {
  city: string
  overview: string
  zones: { name: string; detail: string }[]
  howToPay: string[]
  apps: { name: string; note?: string }[]
  tips: string[]
  officialLinks: { label: string; url: string }[]
  confidence: 'low' | 'medium' | 'high'
  caveats: string[]
  sources: { label: string; url: string }[]
  stub: boolean
  generatedAt: string
}

// Per-instance cache — a city's parking model barely changes, so cache hard.
const cache = new Map<string, { at: number; data: CityHelp }>()
const TTL_MS = 24 * 60 * 60 * 1000

const STUB_CAVEAT = 'Demo content — connect the AI backend (set GEMINI_API_KEY) for live, cited info.'
const ALWAYS_CAVEAT = 'AI orientation, not Kerb-verified data — always confirm at the meter or on the sign.'

// A small curated sample so the feature is demonstrable before a key is wired in.
const SAMPLES: Record<string, Partial<CityHelp>> = {
  zurich: {
    overview:
      "Zürich uses Switzerland's blue-zone / white-zone street-parking system. There's no SMS parking like in Serbia — you either display a parking disc in a blue zone, or pay at a meter or in an app in a white zone.",
    zones: [
      { name: 'Blue Zone (Blaue Zone)', detail: 'Free with a parking disc (Parkscheibe) for a posted limit — often 1 hour on weekdays. Residents with a permit may park longer.' },
      { name: 'White Zone (Weisse Zone)', detail: 'Paid, metered. Pay at the machine or via an app for the time you need.' },
    ],
    howToPay: [
      'Blue zone: set a parking disc to your arrival time — free up to the limit on the sign.',
      'White zone: pay at the meter (coins/card) or in an app.',
      'No SMS parking in Switzerland.',
    ],
    apps: [
      { name: 'Parkingpay', note: 'Most widely used app for paid street parking & garages.' },
      { name: 'TWINT', note: 'Swiss mobile pay, accepted at many meters.' },
      { name: 'EasyPark', note: 'Also works in Zürich.' },
    ],
    tips: [
      'A parking disc (Parkscheibe) is cheap and sold at kiosks/petrol stations — keep one in the car.',
      'Blue-zone time limits and permit rules vary by street — read the sign.',
      'White zones are often free on Sundays/holidays, but confirm on the sign.',
    ],
    officialLinks: [
      { label: 'Stadt Zürich — Parkieren', url: 'https://www.stadt-zuerich.ch/parkieren' },
    ],
    confidence: 'medium',
  },
}

const stubFor = (city: string): CityHelp => {
  const key = city.trim().toLowerCase()
  const sample = SAMPLES[key]
  if (sample) {
    return {
      city,
      overview: sample.overview ?? '',
      zones: sample.zones ?? [],
      howToPay: sample.howToPay ?? [],
      apps: sample.apps ?? [],
      tips: sample.tips ?? [],
      officialLinks: sample.officialLinks ?? [],
      confidence: sample.confidence ?? 'low',
      caveats: [ALWAYS_CAVEAT, STUB_CAVEAT],
      sources: [],
      stub: true,
      generatedAt: new Date().toISOString(),
    }
  }
  return {
    city,
    overview:
      `We don't have verified data for ${city} yet. In most European cities, street parking is split into colour-coded zones — paid at a meter or in an app, with limits and free hours that vary by street.`,
    zones: [],
    howToPay: [
      'Look for a meter or a parking-app sticker near the bay.',
      'Pay for the time you need and keep the ticket/confirmation.',
      'Read the sign for time limits and free hours.',
    ],
    apps: [],
    tips: ['When in doubt, the sign next to the bay always wins.'],
    officialLinks: [],
    confidence: 'low',
    caveats: [ALWAYS_CAVEAT, STUB_CAVEAT],
    sources: [],
    stub: true,
    generatedAt: new Date().toISOString(),
  }
}

// ── Gemini (Google) path — web-grounded, JSON-shaped ─────────────────────────────
const PROMPT = (city: string, lat?: number, lng?: number) => `You are a street-parking orientation assistant for the Kerb app. The user is physically in ${city}${lat && lng ? ` (near ${lat.toFixed(4)}, ${lng.toFixed(4)})` : ''}, a city Kerb has no verified data for. Use web search to find how STREET parking works there right now.

Return ONLY a JSON object (no markdown) matching exactly:
{
  "overview": string,            // 1-2 sentences: how street parking works here
  "zones": [{ "name": string, "detail": string }],   // colour/permit zones, if any
  "howToPay": [string],          // concrete steps / methods
  "apps": [{ "name": string, "note": string }],       // payment apps actually used here
  "tips": [string],              // practical, local
  "officialLinks": [{ "label": string, "url": string }],
  "confidence": "low" | "medium" | "high",
  "caveats": [string]
}

Rules:
- Do NOT invent specifics. If you can't verify a price, code, or number, omit it or keep it general.
- Prefer official city / parking-operator sources for links.
- Street parking only (not private garages) unless clearly relevant.
- If SMS payment is not used here, say so.
- Be concise and practical. Keep arrays short (max ~5 each).`

const extractJson = (text: string): any => {
  const fenced = text.replace(/```json\s*|\s*```/g, '')
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON in model output')
  return JSON.parse(fenced.slice(start, end + 1))
}

const askGemini = async (city: string, lat: number | undefined, lng: number | undefined, key: string): Promise<CityHelp> => {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const res: any = await $fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      body: {
        contents: [{ role: 'user', parts: [{ text: PROMPT(city, lat, lng) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      },
      timeout: 20_000,
    },
  )

  const cand = res?.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('').trim()
  const j = extractJson(text)

  // Grounding citations, if the model used search
  const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c: any) => c?.web)
    .filter((w: any) => w?.uri)
    .map((w: any) => ({ label: w.title || w.uri, url: w.uri }))
    .slice(0, 6)

  return {
    city,
    overview: String(j.overview ?? ''),
    zones: Array.isArray(j.zones) ? j.zones.slice(0, 6) : [],
    howToPay: Array.isArray(j.howToPay) ? j.howToPay.slice(0, 6) : [],
    apps: Array.isArray(j.apps) ? j.apps.slice(0, 6) : [],
    tips: Array.isArray(j.tips) ? j.tips.slice(0, 6) : [],
    officialLinks: Array.isArray(j.officialLinks) ? j.officialLinks.slice(0, 6) : [],
    confidence: ['low', 'medium', 'high'].includes(j.confidence) ? j.confidence : 'low',
    caveats: [ALWAYS_CAVEAT, ...(Array.isArray(j.caveats) ? j.caveats.slice(0, 4) : [])],
    sources,
    stub: false,
    generatedAt: new Date().toISOString(),
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const city = String(body?.city ?? '').trim().slice(0, 80)
  const lat = Number.isFinite(body?.lat) ? Number(body.lat) : undefined
  const lng = Number.isFinite(body?.lng) ? Number(body.lng) : undefined

  if (!city) throw createError({ statusCode: 400, statusMessage: 'Missing city' })

  const cacheKey = city.toLowerCase()
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data

  const key = process.env.GEMINI_API_KEY
  let data: CityHelp
  if (key) {
    try {
      data = await askGemini(city, lat, lng, key)
    } catch (e) {
      // Don't 500 the UI — fall back to the labelled stub on any model/parse error,
      // but log it so a misconfigured key/model is diagnosable in the server logs.
      console.error('[city-help] Gemini call failed, serving stub:', e)
      data = stubFor(city)
    }
  } else {
    data = stubFor(city)
  }

  cache.set(cacheKey, { at: Date.now(), data })
  return data
})
