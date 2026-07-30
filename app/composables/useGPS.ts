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

// Cyrillic → Serbian Latin for display (preserves case; digraphs Lj/Nj/Dž).
// Nominatim returns Serbian road names in Cyrillic even with accept-language=en.
const CYR_LAT: Record<string, string> = {
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I',
  'Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R',
  'С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š',
  'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z','и':'i',
  'ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r',
  'с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c','ч':'č','џ':'dž','ш':'š',
}
const transliterate = (s: string): string =>
  s.split('').map((c) => CYR_LAT[c] ?? c).join('')

// Network calls after the GPS fix (reverse geocode, Supabase lookups) have no
// timeout of their own — on a flaky mobile connection they can hang forever,
// leaving the "detecting" screen stuck with no way out. This bounds the whole
// post-fix flow so it always settles.
const DETECT_TIMEOUT_MS = 12000

const fetchWithTimeout = (url: string, opts: RequestInit, ms: number): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const useGPS = () => {
  const supabase = useSupabaseClient()

  const detectedCity = ref<{ id: string; name: string; country: string; flag: string } | null>(null)
  const coords = ref<{ lat: number; lng: number; accuracy: number } | null>(null)
  const detecting = ref(false)
  const gpsError = ref<string | null>(null)
  const gpsDenied = ref(false) // permission denied / no geolocation at all — GPS won't work on this device
  const suggestedZoneName = ref<string | null>(null)
  const detectedStreet = ref<string | null>(null) // reverse-geocoded street at detection
  const unsupportedCity = ref<string | null>(null) // detected a city we have no data for (→ AI help)

  const detectCity = async () => {
    if (!import.meta.client) return null
    if (!navigator.geolocation) {
      gpsError.value = 'Geolocation not supported by your browser.'
      gpsDenied.value = true
      return null
    }

    detecting.value = true
    gpsError.value = null
    gpsDenied.value = false
    suggestedZoneName.value = null
    unsupportedCity.value = null

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        })
      })

      const { latitude, longitude, accuracy } = position.coords
      coords.value = { lat: latitude, lng: longitude, accuracy }

      return await Promise.race([
        detectCityAt(latitude, longitude),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('detect-timeout')), DETECT_TIMEOUT_MS)
        ),
      ])
    } catch (e: any) {
      if (e?.code === 1) { gpsError.value = 'Location access denied. Enable it in browser settings.'; gpsDenied.value = true }
      else if (e?.code === 3 || e?.message === 'detect-timeout') gpsError.value = 'Location request timed out.'
      else gpsError.value = 'Could not detect location.'
      return null
    } finally {
      detecting.value = false
    }
  }

  const detectCityAt = async (latitude: number, longitude: number) => {
    try {
      // Reverse geocode with Nominatim (free, no API key)
      const res = await fetchWithTimeout(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'Kerb/1.0 (parking guide app)' } },
        DETECT_TIMEOUT_MS
      )
      const geo = await res.json()
      const addr = geo.address ?? {}
      const rawStreet = addr.road || addr.pedestrian || addr.footway || null
      detectedStreet.value = rawStreet ? transliterate(rawStreet) : null

      // Nominatim answers with the smallest administrative unit it knows, which
      // across Serbia is usually NOT the city we file parking under: Vračar comes
      // back as "Vracar Urban Municipality" with Belgrade only in `county`, Crveni
      // Krst has Niš in `municipality`, and Petrovaradin reads as its own town with
      // "City of Novi Sad" one level up. Matching `city` alone therefore told
      // drivers standing on a mapped zone that their city was unsupported. So walk
      // outward from the most specific name and take the first that we cover.
      const candidates = [addr.city, addr.town, addr.village, addr.municipality, addr.county]
        .filter(Boolean) as string[]

      if (!candidates.length) {
        gpsError.value = 'Could not determine your city.'
        return null
      }

      // Strip the administrative wrapper words so "City of Novi Sad" can meet
      // "Novi Sad", and compare transliterated + unaccented so Cyrillic answers
      // and "Niš"/"Nis" all land on the same key.
      // Administrative wrappers, which differ by country and sit on either side of
      // the name. Serbia says "City of Novi Sad"; Greece answers a Thessaloniki
      // street with "Thessaloniki Municipal Unit", "Municipality of Thessaloniki"
      // and "Thessaloniki Regional Unit" and nothing else — so a Serbia-shaped
      // strip list left the app on its marketing page while standing on a mapped
      // parking space.
      const bare = (s: string) =>
        transliterate(s)
          .replace(/^(city of|municipality of|the municipality of|grad|gradska opstina|opstina)\s+/i, '')
          .replace(/\s+(municipal unit|regional unit|urban municipality|municipality|regional district|administrative district|district|prefecture|city)$/i, '')
          .trim()
      const key = (s: string) =>
        bare(s).toLowerCase()
          .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj')
          .replace(/\s+/g, ' ')

      // Ten rows — one fetch beats a query per candidate.
      const { data: cities } = await supabase
        .from('cities')
        .select('id, name, country, flag')

      let data: any = null
      for (const c of candidates) {
        data = (cities ?? []).find((row: any) => key(row.name) === key(c)) ?? null
        if (data) break
      }
      const rawCity = transliterate(candidates[0]!)

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
      unsupportedCity.value = transliterate(rawCity)
      return null
    } catch (e: any) {
      gpsError.value = e?.name === 'AbortError' ? 'Location lookup timed out.' : 'Could not detect location.'
      return null
    }
  }

  let _watchId: number | null = null

  const startTracking = () => {
    if (!import.meta.client || !navigator.geolocation) return
    if (_watchId !== null) return
    _watchId = navigator.geolocation.watchPosition(
      (pos) => {
        coords.value = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }
      },
      (err) => console.warn('[Kerb] watchPosition error:', err.code, err.message),
      { enableHighAccuracy: true, maximumAge: 0 }
    )
  }

  const stopTracking = () => {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId)
      _watchId = null
    }
  }

  return { detectCity, detectedCity, detectedStreet, coords, detecting, gpsError, gpsDenied, suggestedZoneName, unsupportedCity, startTracking, stopTracking }
}
