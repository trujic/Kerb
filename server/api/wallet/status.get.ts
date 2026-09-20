// What the guest has left, and where it went. Addressed by their own token.
import { walletFor, balanceOf, entriesOf, feePercent } from '~~/server/utils/wallet'

export default defineEventHandler(async (event) => {
  const token = String(getQuery(event).token ?? '')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'No token' })

  const walletId = await walletFor(token)
  if (!walletId) return { balance: 0, entries: [], feePercent: feePercent() }

  return {
    balance: await balanceOf(walletId),
    entries: await entriesOf(walletId),
    feePercent: feePercent(),
  }
})
