// ── ZONE EDITOR, SERVED FROM THE APP (DEV ONLY) ───────────────────────────────
// The editor lives in scripts/ so it never ships, but running it off a separate
// static server put it on another origin — which meant no shared BroadcastChannel
// and no same-origin POST back. Serving it here in dev gives both, and there is
// one URL to remember instead of two servers to keep alive.
//
//   http://localhost:3000/zone-editor/
//
// Production returns 404: the handler refuses to read anything unless Nitro is
// running in dev.

import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, extname } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
}

export default defineEventHandler((event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const root = join(process.cwd(), 'scripts', 'zone-editor')
  const raw = (getRouterParam(event, 'file') || '').trim()
  const rel = !raw || raw === '/' ? 'index.html' : raw

  // Keep the reader inside the editor folder whatever the path segments say.
  const target = normalize(join(root, rel))
  if (!target.startsWith(root)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  setHeader(event, 'Content-Type', TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'no-store')
  return sendStream(event, createReadStream(target))
})
