<template>
  <div class="azs">
    <div class="azs-field">
      <Icon name="pin" :size="15" />
      <input
        v-model="q"
        type="text"
        class="azs-input"
        :placeholder="t('addressPlaceholder')"
        autocomplete="off"
        @input="onType"
        @keydown.enter.prevent="run"
        @keydown.escape="reset"
      />
      <button v-if="q" type="button" class="azs-x" :aria-label="t('clear')" @click="reset">✕</button>
    </div>

    <p v-if="pending" class="azs-msg">{{ t('searching') }}</p>
    <p v-else-if="error === 'noAddressHit'" class="azs-msg">{{ t('noAddressHit') }}</p>
    <p v-else-if="error" class="azs-msg">{{ t('addressSearchFailed') }}</p>

    <!-- Candidates: a street name repeats across a city, so the suburb decides -->
    <div v-if="!picked && results.length" class="azs-list">
      <button
        v-for="(h, i) in results"
        :key="i"
        type="button"
        class="azs-row"
        @click="pick(h)"
      >
        <b>{{ h.label }}</b>
        <span>
          {{ h.detail || t('unknownArea') }}
          <em v-if="!h.cityId">· {{ t('notCovered') }}</em>
        </span>
      </button>
    </div>

    <!-- The answer -->
    <div v-if="picked" class="azs-hit">
      <div class="azs-hit-top">
        <span class="azs-hit-addr">{{ picked.label }}</span>
        <button type="button" class="azs-again" @click="reset">{{ t('searchAgain') }}</button>
      </div>

      <template v-if="verdict.zone">
        <div class="azs-zone" :style="{ borderColor: zoneColor(verdict.zone) }">
          <span class="azs-zone-head" :style="{ background: zoneColor(verdict.zone), color: inkOn(zoneColor(verdict.zone)) }">
            <span class="azs-zone-name">{{ verdict.zone }}</span>
            <span v-if="zoneOf(verdict.zone)?.price" class="azs-zone-price">
              {{ zoneOf(verdict.zone)!.price }}
            </span>
          </span>
          <p class="azs-zone-note">
            <Icon name="sign" :size="13" /> {{ t('addressCheckSign') }}
          </p>
          <!-- Belgrade splits zones by house number and our polygons do not, so
               the number found the place, not the price. Say so where it bites. -->
          <p v-if="hasHouseNumber" class="azs-zone-warn">
            <Icon name="alert" :size="13" /> {{ t('houseNumberCaveat') }}
          </p>
        </div>
      </template>
      <p v-else-if="loading" class="azs-msg">{{ t('searching') }}</p>
      <!-- No map for that city is not the same as no parking there. -->
      <p v-else-if="!picked.cityId" class="azs-unknown">
        <Icon name="alert" :size="15" />
        {{ t('addressCityNotCovered') }}
      </p>
      <p v-else class="azs-none">
        <Icon name="parking" :size="15" />
        {{ verdict.distM < 400
            ? t('addressNoZoneNear', { dist: fmtDist(verdict.distM) })
            : t('addressNoZone') }}
      </p>

      <button type="button" class="azs-map" @click="$emit('locate', picked)">
        <Icon name="expand" :size="14" /> {{ t('showOnMap') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  cityId?: string | null
  zones?: any[]
  geojson?: any
}>()
defineEmits<{ locate: [hit: any] }>()

const { t } = useLang()
const { results, pending, error, search, clear } = useAddressSearch()

const q = ref('')
const picked = ref<any>(null)
let debounce: ReturnType<typeof setTimeout>

const run = () => search(q.value, props.cityId)
const onType = () => {
  picked.value = null
  clearTimeout(debounce)
  // Nominatim asks for at most one call a second; typing must not outpace that.
  debounce = setTimeout(run, 600)
}
const reset = () => { q.value = ''; picked.value = null; target.value = null; clear() }
const pick = async (h: any) => {
  picked.value = h
  clear()
  target.value = null
  // Only cities we cover have a map to check against.
  if (h.cityId && h.cityId !== props.cityId) await loadCity(h.cityId)
}

// Answering about another city means loading that city's map, not measuring its
// address against the one we happen to be standing in — which would have found
// no zone at all and quietly reported "no paid parking here".
const target = ref<{ geojson: any; zones: any[] } | null>(null)
const loading = ref(false)
const db = useSupabaseClient<any>()
const { getCity } = useCity()

const loadCity = async (id: string) => {
  loading.value = true
  try {
    const [geo, city] = await Promise.all([
      db.from('city_zones').select('geojson').eq('city_id', id).maybeSingle()
        .then((r: any) => r.data?.geojson)
        .catch(() => null)
        .then((g: any) => g ?? fetch(`/zones/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)),
      getCity(id).catch(() => null),
    ])
    target.value = { geojson: geo, zones: (city as any)?.zones ?? [] }
  } finally {
    loading.value = false
  }
}

const activeGeo = computed(() => target.value?.geojson ?? props.geojson)
const activeZones = computed(() =>
  target.value?.zones?.length ? target.value.zones : props.zones ?? [],
)
const verdict = computed(() =>
  picked.value && !loading.value
    ? zoneAtPoint(picked.value.lat, picked.value.lng, activeGeo.value)
    : { zone: null, distM: Infinity, street: null },
)
const zoneOf = (name: string) => activeZones.value.find((z: any) => z.name === name) ?? null
const zoneColor = (name: string) => zoneOf(name)?.color ?? 'var(--text2)'
// Key off what was ASKED, not what came back: Nominatim often resolves
// "Koste Stojanovića 15" to the street alone, and the caveat has to fire on the
// question — someone who typed a number is asking about that number.
const hasHouseNumber = computed(() =>
  /\d/.test(q.value) || /\d/.test(picked.value?.label ?? ''),
)
const fmtDist = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(5, Math.round(m / 5) * 5)} m`
</script>

<style scoped>
.azs-field {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  background: var(--bg2);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
  color: var(--muted);
}
.azs-field:focus-within { border-color: var(--blue); }
.azs-input {
  flex: 1;
  min-width: 0;
  padding: 12px 0;
  font-family: inherit;
  font-size: 14px;
  color: var(--text);
  background: none;
  border: none;
  outline: none;
}
.azs-input::placeholder { color: var(--muted2); }
.azs-x {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}
.azs-msg { margin-top: 7px; font-size: 12px; color: var(--muted); }

.azs-list { margin-top: 7px; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
.azs-row {
  display: block;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  font-family: inherit;
  background: var(--bg2);
  border: none;
  border-top: 1px solid var(--border);
  cursor: pointer;
}
.azs-row:first-child { border-top: none; }
.azs-row:hover { background: var(--bg3); }
.azs-row b { display: block; font-size: 13.5px; font-weight: 600; color: var(--text); }
.azs-row span { font-size: 11.5px; color: var(--muted); }

.azs-hit { margin-top: 10px; }
.azs-hit-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.azs-hit-addr { font-size: 13.5px; font-weight: 700; color: var(--text); }
.azs-again { font-size: 12px; font-weight: 600; color: var(--blue); background: none; border: none; cursor: pointer; padding: 0; }

.azs-zone { border: 1.5px solid; border-radius: var(--r-md); overflow: hidden; background: var(--bg2); }
.azs-zone-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; }
.azs-zone-name { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; }
.azs-zone-price { font-family: var(--font-mono); font-size: 13px; font-weight: 700; }
.azs-zone-note,
.azs-zone-warn { display: flex; align-items: flex-start; gap: 7px; padding: 9px 12px; font-size: 12px; line-height: 1.45; }
.azs-zone-note { color: var(--text2); }
.azs-zone-warn { color: var(--amber); border-top: 1px solid var(--border); }
.azs-zone-note svg, .azs-zone-warn svg { flex-shrink: 0; margin-top: 1px; }

.azs-none {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 11px 12px; font-size: 12.5px; line-height: 1.5;
  color: var(--green); background: var(--green-bg);
  border: 1px solid var(--green-border); border-radius: var(--r-md);
}
.azs-none svg { flex-shrink: 0; margin-top: 1px; }

.azs-unknown {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 11px 12px; font-size: 12.5px; line-height: 1.5;
  color: var(--amber); background: var(--amber-bg);
  border: 1px solid var(--amber-border); border-radius: var(--r-md);
}
.azs-unknown svg { flex-shrink: 0; margin-top: 1px; }
.azs-row em { font-style: normal; color: var(--amber); }

.azs-map {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; margin-top: 8px; padding: 10px;
  font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--text2);
  background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-md); cursor: pointer;
}
.azs-map:hover { border-color: var(--border2); color: var(--text); }
</style>
