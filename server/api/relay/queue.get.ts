// ── WHAT IS WAITING ──────────────────────────────────────────────────────────
// The relay's own list. Open requests first, then whatever was answered today,
// so the relay can see their own recent work without a second screen.

import { relayDb, requireRelay } from '~~/server/utils/relay'

export default defineEventHandler(async (event) => {
  await requireRelay(event)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await relayDb()
    .from('relay_requests')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const rows = data ?? []
  return {
    open: rows.filter((r: any) => r.state === 'pending' || r.state === 'working'),
    done: rows.filter((r: any) => !['pending', 'working'].includes(r.state)),
  }
})
