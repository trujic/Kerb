// ── MONEY IN ─────────────────────────────────────────────────────────────────
// Recorded by whoever actually received it. In the pilot that is a host taking
// cash at check-in, or Kerb taking a transfer — both of which are real events a
// person witnessed, which is the only kind this route accepts.
//
// There is deliberately no card checkout behind this yet. A button that looks
// like it charges a card and does not is the one thing a payment screen must
// never be; when a provider is connected it becomes a second way to reach this
// same entry, not a different ledger.

import { relayDb, requireRelay } from '~~/server/utils/relay'
import { walletFor, balanceOf, walletByCode } from '~~/server/utils/wallet'

export default defineEventHandler(async (event) => {
  const relay = await requireRelay(event)
  const body = await readBody<{ token?: string; code?: string; amount?: number; note?: string }>(event)

  // A host has the code the visitor showed them, not the token behind it.
  const code = String(body?.code ?? '').trim()
  const token = code
    ? (await walletByCode(code))?.guest_token ?? ''
    : String(body?.token ?? '').trim()
  const amount = Math.round(Number(body?.amount))
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: code ? `No wallet with code ${code}` : 'No guest token' })
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000) {
    throw createError({ statusCode: 400, statusMessage: 'Amount must be 1–50000 RSD' })
  }

  const walletId = await walletFor(token, true)
  const { error } = await relayDb().from('wallet_entries').insert({
    wallet_id: walletId,
    kind: 'topup',
    amount_rsd: amount,
    note: (body?.note ?? '').trim() || 'cash',
    taken_by: relay.id,
  })
  if (error) {
    const hint = /wallet_entries|guest_wallets|schema cache/i.test(error.message)
      ? 'run scripts/migration-guest-wallets.sql'
      : error.message
    throw createError({ statusCode: 500, statusMessage: hint })
  }

  return { ok: true, balance: await balanceOf(walletId!) }
})
