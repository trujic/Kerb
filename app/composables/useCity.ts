export interface CityListItem {
  id: string
  name: string
  country: string
  flag: string
  verified: boolean
  last_updated: string
  tags: { id: string; label: string }[]
}

export const useCity = () => {
  const supabase = useSupabaseClient()
  const { isLive } = useLiveCities()

  // Fetch all cities for the homepage grid
  const getCities = async () => {
    const { data, error } = await supabase
      .from('cities')
      .select(`
        id,
        name,
        country,
        flag,
        verified,
        last_updated,
        tags ( label )
      `)
      .order('name')

    if (error) throw error
    // Drafts sit alongside the real list in dev so the grid shows what the card
    // will look like — badge, tags and all — before anything is published. The
    // live-city gate applies to them too, so localhost shows what the public sees.
    let list: any[] = data ?? []
    if (import.meta.dev) {
      const drafts = await Promise.all(draftCityIds().map((id) => draftCity(id)))
      const extra = drafts.filter((d) => d && !list.some((c: any) => c.id === d.id))
      if (extra.length) list = [...list, ...extra].sort((a: any, b: any) => a.name.localeCompare(b.name))
    }
    return list.filter((c: any) => isLive(c.id))
  }

  // Fetch one city with all related data for the detail page. `fast` is for the
  // first screen: one try, bounded (see bootRead), because a cached copy is
  // waiting behind it.
  const getCity = async (id: string, opts: { fast?: boolean } = {}) => {
    const draft = await draftCity(id)
    if (draft) return { ...draft, live: isLive(id) }
    let query = supabase
      .from('cities')
      .select(`
        *,
        zones        ( id, name, color, rules, price, sort_order, sms_shortcode,
                       price_amount, price_currency, price_minutes,
                       pay_method, pay_target, pay_label, daily_amount, daily_target ),
        payment_methods ( id, label, sort_order ),
        tips         ( id, icon, text, sort_order ),
        tags         ( id, label )
      `)
      .eq('id', id)
    const signal = opts.fast ? bootSignal() : undefined
    if (signal) query = query.abortSignal(signal)
    const { data, error } = opts.fast ? await query.single().retry(false) : await query.single()

    if (error) throw error

    // Sort related arrays by sort_order
    if (data) {
      // Unpublished cities still resolve — the page needs the name and the
      // operator's link to say "not covered yet" — but callers must check this.
      data.live = isLive(data.id)
      data.zones           = data.zones?.sort((a: any, b: any) => a.sort_order - b.sort_order)
      data.payment_methods = data.payment_methods?.sort((a: any, b: any) => a.sort_order - b.sort_order)
      data.tips            = data.tips?.sort((a: any, b: any) => a.sort_order - b.sort_order)
    }

    return data
  }

  // Search cities by name or country
  const searchCities = async (query: string) => {
    const { data, error } = await supabase
      .from('cities')
      .select('id, name, country, flag')
      .or(`name.ilike.*${query}*,country.ilike.*${query}*`)
      .limit(20)

    if (error) throw error
    return (data ?? []).filter((c: any) => isLive(c.id)).slice(0, 6)
  }

  // Street → zone lookup (registry tier). Returns matches for a typed street name.
  const searchStreetZone = async (cityId: string, query: string) => {
    const q = query.trim()
    if (q.length < 2) return []
    const { data, error } = await supabase
      .from('street_zones')
      .select('street_name, zone_name')
      .eq('city_id', cityId)
      .ilike('street_name', `%${q}%`)
      .limit(8)
    if (error) { console.warn('[Kerb] searchStreetZone failed:', error); return [] }
    return data ?? []
  }

  // Submit a community contribution
  const submitContribution = async (form: {
    city_name: string
    country: string
    update_type: string
    content: string
    source_url: string
  }) => {
    const { error } = await supabase
      .from('contributions')
      .insert([form])

    if (error) throw error
    return true
  }

  return { getCities, getCity, searchCities, searchStreetZone, submitContribution }
}