// ── THE RELAY SAYS WHAT HAPPENED ─────────────────────────────────────────────
// Four moves: claim it, or close it as confirmed / failed / unknown.
//
// `confirmed` is the only one that requires evidence — the operator's own reply,
// pasted in. A relay saying "yes I sent it" is a claim; the operator's message
// carries the plate and is the only thing the guest can actually rely on, and
// the only thing worth anything if they are fined anyway.

import { relayDb, requireRelay } from '~~/server/utils/relay'

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
  if (action === 'confirmed' && !reply) {
    throw createError({ statusCode: 400, statusMessage: 'Confirmed needs the operator reply' })
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
