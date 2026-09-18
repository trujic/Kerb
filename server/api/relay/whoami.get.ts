// ── WHO DOES THE SERVER THINK YOU ARE ────────────────────────────────────────
// Diagnostic for the one confusing failure this feature has: "not a relay" can
// mean the env list is empty, or the list is fine but the server cannot see
// your session at all. Those need opposite fixes, so the route says which.
// Safe to leave in: it reveals ids the account already owns, nothing else.

import { relayUserIds, userIdOf } from '~~/server/utils/relay'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  let user: any = null
  let userError: string | null = null
  try { user = await serverSupabaseUser(event) } catch (e: any) { userError = e?.message ?? String(e) }

  const allowed = relayUserIds()
  const id = userIdOf(user)
  return {
    envLoaded: !!process.env.RELAY_USER_IDS,
    allowed,
    seesSession: !!user,
    userError,
    youAre: user ? { id, email: (user as any).email, idField: user.id ? 'id' : (user as any).sub ? 'sub' : 'none' } : null,
    verdict: !allowed.length ? 'RELAY_USER_IDS is empty in this environment — set it, then redeploy (a running build never picks it up) or restart the dev server'
      : !user ? 'The server cannot see your session — are you logged in in this browser?'
      : id && allowed.includes(id) ? 'You are a relay'
      : 'Logged in, but this user id is not in RELAY_USER_IDS',
  }
})
