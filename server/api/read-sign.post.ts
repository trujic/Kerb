// ── SIGN READ (CLAUDE VISION) ─────────────────────────────────────────────────
// Reads a photographed parking sign into per-field values, each carrying its own
// read quality. This replaces Tesseract for the `claude` engine — Tesseract runs
// `eng` on signs that are half Cyrillic, photographed at an angle in direct sun,
// and its failure mode is a confident wrong digit, which is the one failure this
// product cannot afford.
//
// What this endpoint does NOT do: decide which zone the driver is in. It reports
// what is legible on the sign; `useSignScan.matchZone` maps that to the city's
// zone deterministically. The model reads, the registry decides — same split as
// the zone resolver, and the reason a misread never silently becomes a payment.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

// A field is only 'read' when the model would stake the driver's money on it.
const FieldState = z.enum(['read', 'low', 'unreadable'])
const Field = z.object({
  value: z.string().nullable(),
  state: FieldState,
})

const SignReadSchema = z.object({
  // True when the frame carries no parking tariff at all — another sign that
  // merely shares a colour, a shopfront, a wall. Blocks every downstream read.
  notSign: z.boolean(),
  // Everything legible, transcribed verbatim in its original script. Kept in
  // sign_reports.raw_text so parsing can be improved against real signs later.
  rawText: z.string(),
  // The sign's own colour band, named in English ('blue', 'red', 'white',
  // 'extra', 'green', 'yellow'). Corroborates the text read; never replaces it.
  dominantColor: z.string().nullable(),
  zone: Field,
  price: Field,
  limit: Field,
  code: Field,
  hours: Field,
})

const SYSTEM = `You read photographs of street-parking signs in Serbia and report only what is legible.

The signs are in Serbian, in either Cyrillic or Latin script, often both on one sign. They are photographed at the kerb: at an angle, in direct sun, partly shaded, sometimes weathered or stickered over.

Report these fields:
- zone: the zone as the sign names it (e.g. "ПЛАВА ЗОНА", "Plava zona", "EXTRA ZONA").
- price: the hourly tariff exactly as printed, with its unit (e.g. "50 RSD/h", "100 din/sat").
- limit: the maximum stay, if the sign states one (e.g. "60 min", "2 h"). Many zones have none.
- code: the SMS shortcode for paying (a 4-digit number, in Serbia typically starting with 8 or 9).
- hours: the charging hours as printed (e.g. "07-21, sub 07-14").

Give every field its own state:
- "read": you can see it clearly and would stake someone's money on it.
- "low": you can probably make it out, but it is blurred, cropped, angled or partly hidden.
- "unreadable": you cannot see it, or the sign does not state it. Use null for the value.

Rules that matter more than completeness:
- Never infer a field from what Serbian parking signs usually say. A field you cannot see is "unreadable", not a plausible default. Someone pays money on this reading and gets fined when it is wrong.
- Never derive the zone from the sign's colour alone. Colour goes in dominantColor; zone comes from text you can actually read.
- Never output a shortcode you cannot read digit by digit. A single wrong digit sends the payment to another city's zone.
- If the image shows something that is not a parking tariff sign, set notSign true and every field unreadable.
- A partly readable sign is normal and useful. Report the fields you can read and mark the rest unreadable, rather than declining the whole image.`

// Best-effort per-IP throttle. This endpoint spends money per call, and the scan
// flow is guest-first by design, so there is no account to rate-limit against.
// Module state does not survive a cold start on serverless — treat this as a
// speed bump, not a wall; the real limit is the per-device scan meter.
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX = 12
const hits = new Map<string, number[]>()

const rateLimited = (ip: string): boolean => {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear() // crude ceiling; this is not a store
  return recent.length > RATE_MAX
}

const MAX_B64_BYTES = 1_600_000 // ~1.2 MB of JPEG; the client sends ~1024px
const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default defineEventHandler(async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  // No key configured is not an error the driver should see as a crash — the
  // caller falls back to on-device OCR.
  if (!apiKey) return { ok: false, reason: 'no-key' as const }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (rateLimited(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many scans, try again shortly' })
  }

  const body = await readBody<{ image?: string; mediaType?: string }>(event)
  const image = body?.image ?? ''
  const mediaType = body?.mediaType ?? 'image/jpeg'

  if (!image) throw createError({ statusCode: 400, statusMessage: 'Missing image' })
  if (!MEDIA.has(mediaType)) throw createError({ statusCode: 400, statusMessage: 'Unsupported image type' })
  if (image.length > MAX_B64_BYTES) throw createError({ statusCode: 413, statusMessage: 'Image too large' })

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.parse({
      // Opus by default; set KERB_SIGN_MODEL to trade accuracy for cost per scan.
      model: process.env.KERB_SIGN_MODEL || 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM,
      // Reading a sign is a short task, but the judgement that matters — refusing
      // a digit rather than guessing it — is worth some thinking. Medium is the
      // dial to turn if scans cost more than they are worth.
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(SignReadSchema),
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: image } },
            { type: 'text', text: 'Read this parking sign.' },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return { ok: false as const, reason: 'refused' as const }
    }
    const read = response.parsed_output
    if (!read) return { ok: false as const, reason: 'unparsed' as const }

    return {
      ok: true as const,
      read,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    }
  } catch (err) {
    // Every failure here is recoverable: the caller drops to on-device OCR, and
    // the driver still gets the manual zone picker. Never turn a read failure
    // into a blocked scan.
    if (err instanceof Anthropic.RateLimitError) return { ok: false as const, reason: 'rate-limit' as const }
    if (err instanceof Anthropic.AuthenticationError) return { ok: false as const, reason: 'auth' as const }
    if (err instanceof Anthropic.APIError) {
      console.warn('[Kerb] sign read failed:', err.status, err.message)
      return { ok: false as const, reason: 'api' as const }
    }
    console.warn('[Kerb] sign read failed:', err)
    return { ok: false as const, reason: 'unknown' as const }
  }
})
