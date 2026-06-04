const normalizeStreet = (name: string): string => {
  const cyr: Record<string, string> = {
    'А':'a','Б':'b','В':'v','Г':'g','Д':'d','Ђ':'dj','Е':'e','Ж':'z',
    'З':'z','И':'i','Ј':'j','К':'k','Л':'l','Љ':'lj','М':'m','Н':'n',
    'Њ':'nj','О':'o','П':'p','Р':'r','С':'s','Т':'t','Ћ':'c','У':'u',
    'Ф':'f','Х':'h','Ц':'c','Ч':'c','Џ':'dz','Ш':'s',
    'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z',
    'з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n',
    'њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u',
    'ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s',
  }
  const latin = name.split('').map(c => cyr[c] ?? c).join('')
  return latin
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    .replace(/\s+(i{1,3}|iv|vi{0,3}|ix|xl|l|xc|c{1,3})$/i, '')
    .trim()
}

export const useGPS = () => {
  const supabase = useSupabaseClient()

  const detectedCity = ref<{ id: string; name: string; country: string; flag: string } | null>(null)
  const coords = ref<{ lat: number; lng: number; accuracy: number } | null>(null)
  const detecting = ref(false)
  const gpsError = ref<string | null>(null)
  const suggestedZoneName = ref<string | null>(null)

  const detectCity = async () => {
    if (!import.meta.client) return null
    if (!navigator.geolocation) {
      gpsError.value = 'Geolocation not supported by your browser.'
      return null
    }

    detecting.value = true
    gpsError.value = null
    suggestedZoneName.value = null

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          maximumAge: 300000,
        })
      })

      const { latitude, longitude, accuracy } = position.coords
      coords.value = { lat: latitude, lng: longitude, accuracy }

      // Reverse geocode with Nominatim (free, no API key)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'Kerb/1.0 (parking guide app)' } }
      )
      const geo = await res.json()
      const rawCity = geo.address?.city || geo.address?.town || geo.address?.village || null
      const rawStreet = geo.address?.road || geo.address?.pedestrian || geo.address?.footway || null

      if (!rawCity) {
        gpsError.value = 'Could not determine your city.'
        return null
      }

      // Match against our database (case-insensitive)
      const { data } = await supabase
        .from('cities')
        .select('id, name, country, flag')
        .ilike('name', rawCity)
        .single()

      if (data) {
        detectedCity.value = data

        // Look up suggested parking zone from the detected street
        if (rawStreet) {
          const normalized = normalizeStreet(rawStreet)

          // Try exact normalized match first
          const { data: exact } = await supabase
            .from('street_zones')
            .select('zone_name')
            .eq('city_id', data.id)
            .eq('street_normalized', normalized)
            .maybeSingle()

          if (exact) {
            suggestedZoneName.value = exact.zone_name
          } else {
            // Fuzzy fallback: street name contains the normalized query
            const { data: fuzzy } = await supabase
              .from('street_zones')
              .select('zone_name')
              .eq('city_id', data.id)
              .ilike('street_normalized', `%${normalized}%`)
              .limit(1)
              .maybeSingle()
            suggestedZoneName.value = fuzzy?.zone_name ?? null
          }
        }

        return data
      }

      gpsError.value = `You appear to be in ${rawCity}, but we don't have parking data for it yet.`
      return null
    } catch (e: any) {
      if (e?.code === 1) gpsError.value = 'Location access denied. Enable it in browser settings.'
      else if (e?.code === 3) gpsError.value = 'Location request timed out.'
      else gpsError.value = 'Could not detect location.'
      return null
    } finally {
      detecting.value = false
    }
  }

  return { detectCity, detectedCity, coords, detecting, gpsError, suggestedZoneName }
}
