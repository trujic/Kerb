// ── THE RELAY SAYS WHAT HAPPENED ─────────────────────────────────────────────
// Four moves: claim it, or close it as confirmed / failed / unknown.
//
// `confirmed` is the only one that requires evidence — the operator's own reply,
// pasted in. A relay saying "yes I sent it" is a claim; the operator's message
// carries the plate and is the only thing the guest can actually rely on, and
// the only thing worth anything if they are fined anyway.

import { relayDb, requireRelay } from '~~/server/utils/relay'
import { chargeForRequest } from '~~/server/utils/wallet'

const CLOSING = ['confirmed', 'failed', 'unknown'] as const

export default defineEventHandler(async (event) => {
  const relay = await requireRelay(event)
  const body = await readBody<{ id?: string; action?: string; reply?: string; note?: string }>(event)

  const id = String(body?.id ?? '')
  const action = String(body?.action ?? '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No id' })

  const db = relayDb()

  if (action === 'claim') {
    const { error } = await db
      .from('relay_requests')
      .update({ state: 'working', claimed_by: relay.id, claimed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('state', 'pending')          // whoever gets there first keeps it
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return { ok: true }
  }

  if (!(CLOSING as readonly string[]).includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  }

  const reply = (body?.reply ?? '').trim()

  // ── THE ONE CHECK THAT SURVIVES A DISHONEST RELAY ──────────────────────────
  // The composer is editable, so whoever sends the message can change the plate
  // or drop to a cheaper zone and still tell the guest it is paid. The operator
  // does not lie: its reply names the vehicle it actually charged for. So a
  // request may only be closed as paid when that reply mentions this plate.
  //
  // This does not catch everything — a relay could pay a shorter time than
  // asked — but it catches the case that ends in a fine, which is the one the
  // guest cannot check for themselves and cannot recover from.
  if (action === 'confirmed') {
    if (!reply) {
      throw createError({ statusCode: 400, statusMessage: 'Confirmed needs the operator reply' })
    }
    const { data: job } = await db
      .from('relay_requests')
      .select('plate')
      .eq('id', id)
      .single()
    const plate = String(job?.plate ?? '')
    const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9ČĆŽŠĐ]/g, '')
    if (plate && !norm(reply).includes(norm(plate))) {
      throw createError({
        statusCode: 400,
        statusMessage: `That reply does not mention ${plate}. If the operator answered about another vehicle, close this as failed.`,
      })
    }
  }

  // The wallet moves only on a confirmed payment. A failed or unknown outcome
  // costs the guest nothing, because nothing was bought on their behalf.
  if (action === 'confirmed') {
    const { data: full } = await db
      .from('relay_requests')
      .select('wallet_token, price_text, plate, zone')
      .eq('id', id)
      .single()
    const quoted = Number(/^(\d+)/.exec(String(full?.price_text ?? ''))?.[1])
    if (full?.wallet_token && Number.isFinite(quoted) && quoted > 0) {
      await chargeForRequest(full.wallet_token, id, quoted, `${full.zone} · ${full.plate}`)
    }
  }

  const { error } = await db
    .from('relay_requests')
    .update({
      state: action,
      operator_reply: reply || null,
      outcome_note: (body?.note ?? '').trim() || null,
      answered_at: new Date().toISOString(),
      claimed_by: relay.id,
    })
    .eq('id', id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
