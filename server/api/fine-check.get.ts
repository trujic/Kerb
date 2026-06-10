// ── Manual fine check ──────────────────────────────────────────────────────────
// Proxies the public JKP Parking servis lookup (portal.parkingns.rs) because its
// CORS only allows its own origin — a browser fetch from Kerb would be blocked.
// We relay the city's own records; we don't author them.
//
//   GET /api/fine-check?plate=NS123AB
//
// Privacy note: this is a manual, user-initiated lookup of a single plate the
// person typed. We do NOT iterate plates or store results — only relay.

interface UpstreamFine {
  brojNaloga?: number
  regOznaka?: string
  zaUplatu?: number | string
  nazivStatusa?: string
  statusNaloga?: number
  primalac?: string
  nazivGrada?: string
  rokPl?: string | null
  vaziDo?: string | null
  qrcode?: string | null
}

// Small per-instance cache so repeated checks of the same plate don't hammer the
// city's server (manual feature, but users re-tap).
const cache = new Map<string, { at: number; data: unknown }>()
const TTL_MS = 60_000

export default defineEventHandler(async (event) => {
  const plate = String(getQuery(event).plate ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')

  if (!/^[A-ZČĆŽŠĐ0-9]{4,10}$/.test(plate)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid plate format' })
  }

  const hit = cache.get(plate)
  if (hit && Date.now() - hit.at < TTL_MS) {
    setHeader(event, 'Cache-Control', 'private, max-age=60')
    return hit.data
  }

  let upstream: unknown
  try {
    upstream = await $fetch('https://portal.parkingns.rs/portal/auth/checkPPK', {
      query: { platePr: plate },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KerbBot/1.0; +https://kerb.app)',
        Origin: 'https://portal.parkingns.rs',
        Accept: 'application/json',
      },
      timeout: 12_000,
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Fine service is unavailable right now' })
  }

  const list = (Array.isArray(upstream) ? upstream : []) as UpstreamFine[]
  const fines = list.map((f) => ({
    ticketNo: f.brojNaloga ?? null,
    plate: f.regOznaka ?? plate,
    amount: Number(f.zaUplatu) || 0,
    status: f.nazivStatusa ?? null,
    statusCode: f.statusNaloga ?? null,
    recipient: f.primalac ?? null,
    city: f.nazivGrada ?? null,
    dueBy: f.rokPl ?? f.vaziDo ?? null,
    qrcode: f.qrcode ?? null,
  }))

  const data = {
    plate,
    hasFines: fines.length > 0,
    count: fines.length,
    totalDue: fines.reduce((s, f) => s + f.amount, 0),
    currency: 'RSD',
    fines,
    checkedAt: new Date().toISOString(),
  }

  cache.set(plate, { at: Date.now(), data })
  setHeader(event, 'Cache-Control', 'private, max-age=60')
  return data
})
