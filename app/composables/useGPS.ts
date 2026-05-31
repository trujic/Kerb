export const useGPS = () => {
  const supabase = useSupabaseClient()

  const detectedCity = ref<{ id: string; name: string; country: string; flag: string } | null>(null)
  const detecting = ref(false)
  const gpsError = ref<string | null>(null)

  const detectCity = async () => {
    if (!import.meta.client) return null
    if (!navigator.geolocation) {
      gpsError.value = 'Geolocation not supported by your browser.'
      return null
    }

    detecting.value = true
    gpsError.value = null

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          maximumAge: 300000,
        })
      })

      const { latitude, longitude } = position.coords

      // Reverse geocode with Nominatim (free, no API key)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'Kerb/1.0 (parking guide app)' } }
      )
      const geo = await res.json()
      const rawCity = geo.address?.city || geo.address?.town || geo.address?.village || null

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

  return { detectCity, detectedCity, detecting, gpsError }
}
