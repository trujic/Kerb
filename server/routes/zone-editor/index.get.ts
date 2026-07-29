// The [...file] catch-all next door does not match an empty remainder, so a bare
// /zone-editor/ fell through to the Vue app and rendered "City not found".
// Redirecting keeps the trailing slash, which is what makes the editor's own
// relative references (katastar-1.png, belgrade-official.jpg) resolve.
export default defineEventHandler((event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return sendRedirect(event, `/zone-editor/index.html${getQuery(event).city ? `?city=${getQuery(event).city}` : ''}`, 302)
})
