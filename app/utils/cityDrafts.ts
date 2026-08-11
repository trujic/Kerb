// ── CITY DRAFTS (dev only) ────────────────────────────────────────────────────
// A city is a research artefact before it is a database row. The figures have to
// be read off the act, argued about, and seen on the page before anyone decides
// they are fit to publish — and seeding production just to check a layout would
// put unverified numbers in front of drivers to answer a question about spacing.
//
// So a draft lives in the same JSON file the seed script will later take as its
// input, and `npm run dev` reads it directly. One source, two uses, and nothing
// reaches the database until someone means it.
//
// This lives in utils/ rather than in useCity for a blunt reason: a composable
// that contains an `import` statement loses Nuxt's auto-imports, and useCity
// needs useSupabaseClient. Nothing here needs an auto-import, so the import is
// harmless where it sits.

const DRAFTS: Record<string, () => Promise<any>> = {
  sofia: () => import('~~/scripts/data/sofia-city.json'),
  'new-york-city': () => import('~~/scripts/data/new-york-city.json'),
}

export const draftCityIds = () => (import.meta.dev ? Object.keys(DRAFTS) : [])

/** A draft shaped like a Supabase row — ids included so v-for keys work. */
export const draftCity = async (id: string) => {
  if (!import.meta.dev || !DRAFTS[id]) return null
  const mod = await DRAFTS[id]!()
  const d = (mod as any).default ?? mod
  const withIds = (rows: any[] = []) => rows.map((r, i) => ({ id: `${id}-${i}`, ...r }))
  return {
    ...d.city,
    zones: withIds(d.zones),
    payment_methods: withIds(d.payment_methods),
    tips: withIds(d.tips),
    tags: withIds(d.tags),
    _draft: true,
  }
}
