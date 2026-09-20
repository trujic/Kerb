// ── THE GUEST'S MONEY ────────────────────────────────────────────────────────
// Kerb pays the operator in the seconds after a visitor asks, and that visitor
// may be in another country by the weekend. So the money arrives first and this
// file is what holds it: a balance derived from its own entries, never a stored
// total that can quietly disagree with its history.
//
// Every amount here is whole dinars. RSD has no subunit in practice, and an
// integer cannot drift the way a float does when you sum four hundred of them.

import { relayDb, shortCode } from '~~/server/utils/relay'

/** Kerb's cut for making a payment somebody could not make themselves. Shown to
 *  the guest before they ask, never discovered afterwards. */
export const feePercent = (): number => {
  const n = Number(process.env.KERB_FEE_PERCENT ?? 15)
  return Number.isFinite(n) && n >= 0 ? n : 15
}

export const feeOn = (parkingRsd: number): number =>
  Math.round(parkingRsd * (feePercent() / 100))

export const walletFor = async (token: string, create = false) => {
  const db = relayDb()
  const { data } = await db.from('guest_wallets').select('id').eq('guest_token', token).maybeSingle()
  if (data) return data.id as string
  if (!create) return null
  const { data: made, error } = await db
    .from('guest_wallets').insert({ guest_token: token, code: shortCode(token) }).select('id').single()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return made.id as string
}

export const balanceOf = async (walletId: string): Promise<number> => {
  const { data } = await relayDb()
    .from('wallet_entries').select('amount_rsd').eq('wallet_id', walletId)
  return (data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount_rsd), 0)
}

export const entriesOf = async (walletId: string) => {
  const { data } = await relayDb()
    .from('wallet_entries')
    .select('kind, amount_rsd, note, created_at')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}

/** Charge a finished request once. The unique index on (request_id, kind) is
 *  what actually guarantees "once" — a retry hits the database, not a guard we
 *  remembered to write. */
export const chargeForRequest = async (
  token: string, requestId: string, parkingRsd: number, note: string,
) => {
  const walletId = await walletFor(token, true)
  if (!walletId) return
  const db = relayDb()
  const fee = feeOn(parkingRsd)
  await db.from('wallet_entries').insert([
    { wallet_id: walletId, kind: 'parking', amount_rsd: -parkingRsd, request_id: requestId, note },
    { wallet_id: walletId, kind: 'fee', amount_rsd: -fee, request_id: requestId, note: `${feePercent()}%` },
  ])
  return { parkingRsd, fee }
}

/** Find a wallet by the four characters a visitor shows a host. Newest wins if
 *  two ever collide — 31^4 is plenty of room, but "plenty" is not "never". */
export const walletByCode = async (code: string) => {
  const { data } = await relayDb()
    .from('guest_wallets')
    .select('id, guest_token')
    .eq('code', code.toUpperCase())
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}
