<template>
  <div class="czm">
    <div class="czm-head">
      <p class="section-label">{{ t('czmTitle') }}</p>
      <span class="czm-tier" :class="`t-${tier}`">{{ tierLabel }}</span>
    </div>

    <!-- ── cadastre / cadastre_approx: interactive reference map ── -->
    <template v-if="tier === 'cadastre' || tier === 'cadastre_approx'">
      <div v-if="tier === 'cadastre_approx'" class="czm-warn">
        <Icon name="alert" :size="13" /> {{ t('czmApproxWarn', { city: cityName }) }}
      </div>

      <ClientOnly>
        <div v-if="center" class="czm-map">
          <LocationMap
            :lat="center.lat"
            :lng="center.lng"
            :zones="geo"
            :height="300"
            :zone-meta="zones"
            :city-id="cityId"
            interactive
            hide-user
          />
        </div>
        <div v-else-if="mapError" class="czm-loading">{{ t('czmLoadFail') }}</div>
        <div v-else class="czm-loading">{{ t('czmLoading') }}</div>
      </ClientOnly>

      <div v-if="zones?.length" class="czm-legend">
        <span v-for="z in zones" :key="z.name" class="czm-leg">
          <span class="czm-leg-chip" :style="{ background: z.color }" />{{ zoneLabel(z.name) }}
        </span>
      </div>

      <p class="czm-prov">
        <template v-if="copy?.mapNote">{{ copy.mapNote[lang] }}</template>
        <template v-else-if="tier === 'cadastre_approx'">{{ t('czmProvApprox', { prov: provenance }) }}</template>
        <template v-else>{{ t('czmProv', { prov: provenance }) }}</template>
      </p>
    </template>

    <!-- ── street_registry: street → zone lookup ── -->
    <template v-else-if="tier === 'street_registry'">
      <p class="czm-sub">{{ t('czmRegistrySub') }}</p>
      <input
        v-model="q"
        class="czm-input"
        type="text"
        :placeholder="t('czmStreetPh')"
        autocomplete="off"
        @input="onSearch"
      />
      <div v-if="results.length" class="czm-results">
        <div v-for="(r, i) in results" :key="i" class="czm-result">
          <span class="czm-r-street">{{ r.street_name }}</span>
          <span class="czm-r-zone">{{ zoneLabel(r.zone_name) }}</span>
        </div>
      </div>
      <p v-else-if="q.length >= 2 && !searching" class="czm-empty">
        {{ t('czmNotInRegistry') }} <NuxtLink to="/">{{ t('czmScanThere') }}</NuxtLink>.
      </p>
      <p class="czm-prov">{{ t('czmRegistryProv', { prov: provenance }) }}</p>
    </template>

    <!-- ── street_lists: coarse, with an honest caveat ── -->
    <template v-else-if="tier === 'street_lists'">
      <div class="czm-warn">
        <Icon name="alert" :size="13" /> {{ t('czmApproxWarn', { city: cityName }) }}
      </div>
      <NuxtLink to="/" class="czm-scan"><Icon name="camera" :size="14" /> {{ t('czmScanConfirm') }}</NuxtLink>
    </template>

    <!-- ── none: no source we can back ── -->
    <template v-else>
      <div class="czm-none">
        <p class="czm-none-title">{{ t('czmNoneTitle') }}</p>
        <p class="czm-none-sub">{{ t('czmNoneSub') }}</p>
        <NuxtLink to="/" class="czm-scan"><Icon name="camera" :size="14" /> {{ t('czmScanStart') }}</NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MapTier } from '~/composables/useCityTier'

const props = defineProps<{
  cityId: string
  tier: MapTier
  cityName: string
  officialUrl?: string | null
  lastUpdated?: string | null
  zones?: { name: string; color: string }[]
}>()

const { searchStreetZone } = useCity()

const { t, lang, zoneLabel } = useLang()
const copy = computed(() => cityCopy(props.cityId))

const tierLabel = computed(() => ({
  cadastre: t('czmMapped'),
  cadastre_approx: t('czmApprox'),
  street_registry: t('czmRegistry'),
  street_lists: t('czmApprox'),
  none: t('czmSignOnly'),
}[props.tier]))

const provenance = computed(() => {
  let host = ''
  if (props.officialUrl) {
    try { host = ` · ${new URL(props.officialUrl).hostname.replace(/^www\./, '')}` } catch { /* ignore */ }
  }
  const date = props.lastUpdated ? ` · ${t('czmUpdated', { date: props.lastUpdated })}` : ''
  return `${host}${date}`
})

// ── cadastre map geometry ──
const geo = ref<any>(null)
const center = ref<{ lat: number; lng: number } | null>(null)
// "Loading" that never ends is a lie the user cannot act on; a failure they can.
const mapError = ref(false)
onMounted(async () => {
  if ((props.tier !== 'cadastre' && props.tier !== 'cadastre_approx') || !import.meta.client) return
  try {
    const res = await fetch(`/zones/${props.cityId}.json`)
    if (!res.ok) { mapError.value = true; return }
    const data = await res.json()
    geo.value = data
    let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180, seen = false
    for (const f of data.features ?? []) {
      const g = f.geometry
      // MultiPolygon was missing here too — Thessaloniki is 1,957 of them, so
      // `seen` stayed false, `center` never resolved, and the panel sat on
      // "Loading zone map…" forever with no error to explain it.
      const lines = g?.type === 'LineString' ? [g.coordinates]
        : g?.type === 'MultiLineString' ? g.coordinates
        : g?.type === 'Polygon' ? [g.coordinates[0]]
        : g?.type === 'MultiPolygon' ? g.coordinates.map((poly: any) => poly[0])
        : []
      for (const line of lines) for (const c of line) {
        seen = true
        minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0])
        minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1])
      }
    }
    if (seen) center.value = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
    else mapError.value = true
  } catch {
    mapError.value = true
  }
})

// ── registry search ──
const q = ref('')
const results = ref<{ street_name: string; zone_name: string }[]>([])
const searching = ref(false)
let debounce: ReturnType<typeof setTimeout>
const onSearch = () => {
  clearTimeout(debounce)
  if (q.value.trim().length < 2) { results.value = []; return }
  searching.value = true
  debounce = setTimeout(async () => {
    results.value = await searchStreetZone(props.cityId, q.value)
    searching.value = false
  }, 250)
}
</script>

<style scoped>
.czm { margin-bottom: 40px; }
.czm-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.czm-tier {
  font-size: 10px; font-family: var(--font-mono); font-weight: 700;
  text-transform: uppercase; letter-spacing: 1px;
  padding: 3px 9px; border-radius: 20px;
}
.czm-tier.t-cadastre { color: var(--green); background: var(--green-bg); border: 1px solid var(--green-border); }
.czm-tier.t-street_registry { color: var(--blue); background: var(--blue-bg); border: 1px solid var(--blue-border); }
.czm-tier.t-cadastre_approx, .czm-tier.t-street_lists, .czm-tier.t-none { color: var(--amber); background: var(--amber-bg); border: 1px solid var(--amber-border); }

.czm-map { border-radius: var(--r-lg); overflow: hidden; border: 1px solid var(--border); }
.czm-loading { padding: 40px; text-align: center; color: var(--muted); background: var(--bg2); border-radius: var(--r-lg); }

.czm-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.czm-leg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2); }
.czm-leg-chip { width: 12px; height: 12px; border-radius: 3px; }

.czm-prov { margin-top: 12px; font-size: 12px; color: var(--muted); line-height: 1.5; }
.czm-prov strong { color: var(--text2); }

.czm-sub { font-size: 14px; color: var(--muted); margin-bottom: 12px; line-height: 1.5; }
.czm-input {
  width: 100%; padding: 12px 14px; font-size: 15px; font-family: var(--font-body);
  color: var(--text); background: var(--bg); border: 1.5px solid var(--border2);
  border-radius: var(--r-md); outline: none;
}
.czm-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
.czm-results { margin-top: 10px; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
.czm-result { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border-bottom: 1px solid var(--border); }
.czm-result:last-child { border-bottom: none; }
.czm-r-street { font-size: 14px; color: var(--text); }
.czm-r-zone { font-size: 13px; font-weight: 600; font-family: var(--font-mono); color: var(--text2); }
.czm-empty { margin-top: 10px; font-size: 13px; color: var(--muted); }
.czm-empty a { color: var(--blue); }

.czm-warn {
  font-size: 13px; color: var(--amber); line-height: 1.55;
  padding: 12px 14px; background: var(--amber-bg); border: 1px solid var(--amber-border);
  border-radius: var(--r-md); margin-bottom: 12px;
}
.czm-none { padding: 20px; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-lg); text-align: center; }
.czm-none-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.czm-none-sub { font-size: 13px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }
.czm-scan {
  display: inline-block; font-size: 13px; font-weight: 600; color: var(--blue);
}
.czm-scan:hover { text-decoration: underline; }
</style>
