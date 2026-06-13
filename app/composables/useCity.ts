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
    return data
  }

  // Fetch one city with all related data for the detail page
  const getCity = async (id: string) => {
    const { data, error } = await supabase
      .from('cities')
      .select(`
        *,
        zones        ( id, name, color, rules, price, sort_order, sms_shortcode ),
        payment_methods ( id, label, sort_order ),
        tips         ( id, icon, text, sort_order ),
        tags         ( id, label )
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    // Sort related arrays by sort_order
    if (data) {
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
      .limit(6)

    if (error) throw error
    return data
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