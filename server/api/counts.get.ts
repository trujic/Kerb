// ── THE COUNTS, FOR WHOEVER KEEPS KERB ───────────────────────────────────────
// The last 30 days of event_counts, for the admin page. Totals only: the table
// holds nothing else.

import { relayDb, requireAdmin } from '~~/server/utils/relay'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await relayDb()
    .from('event_counts')
    .select('day, event, city, kind, count')
    .gte('day', since)
    .order('day', { ascending: false })
  if (error) {
    const hint = /event_counts|schema cache/i.test(error.message)
      ? 'run scripts/migration-event-counts.sql'
      : error.message
    throw createError({ statusCode: 500, statusMessage: hint })
  }
  return { rows: data ?? [] }
})
