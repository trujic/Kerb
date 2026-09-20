// ── THE GUEST FOLLOWS THEIR OWN REQUEST ──────────────────────────────────────
// Addressed by the opaque token they were handed, never by id, and it returns
// only what the person standing next to the car needs. `claimed_by` and the
// relay's identity are deliberately not in the payload: the guest is owed an
// answer, not a name.

import { relayDb, shortCode } from '~~/server/utils/relay'

export default defineEventHandler(async (event) => {
  const token = String(getQuery(event).token ?? '')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'No token' })

  const { data, error } = await relayDb()
    .from('relay_requests')
    .select('plate, zone, minutes, price_text, state, created_at, claimed_at, answered_at, operator_reply, outcome_note, guest_token')
    .eq('guest_token', token)
    .single()

  if (error || !data) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const { guest_token, ...rest } = data as any
  return { ...rest, code: shortCode(guest_token) }
})
