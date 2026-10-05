<template>
  <div class="lab container">
    <header class="lab-head">
      <h1>Prepoznavanje tabli</h1>
      <p class="lab-sub">
        Prototip. Radi u ovom browseru i ništa ne košta: prepoznaje <b>vrstu</b> table, a cenu,
        SMS broj i ograničenje uzima iz kataloga grada. Kad JKP prelepi cenu, menja se jedan red
        u katalogu, ne model.
      </p>
      <p class="lab-meta">
        <span class="chip" :class="`chip--${rec.status.value}`">{{ statusText }}</span>
        <span>{{ rec.photos.value.length }} fotografija · {{ classes.length }} vrsta tabli</span>
      </p>
    </header>

    <div class="tabs" role="tablist" aria-label="Prototip">
      <button
        v-for="tb in tabs"
        :key="tb.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab === tb.id }"
        :aria-selected="tab === tb.id"
        @click="tab = tb.id"
      >
        {{ tb.label }}
      </button>
    </div>

    <!-- ── Recognise ── -->
    <section v-if="tab === 'scan'" class="pane">
      <p v-if="!rec.photos.value.length" class="empty">
        Još nema primera. Otvori „Primeri" i uvezi potvrđene skenove iz baze ili dodaj svoje fotografije.
      </p>
      <label class="pick">
        <input type="file" accept="image/*" capture="environment" @change="onScan" />
        <Icon name="camera" :size="18" /> Slikaj ili izaberi tablu
      </label>

      <div v-if="scanUrl" class="scan">
        <img :src="scanUrl" alt="Fotografija table" class="scan-img" />
        <div class="verdict">
          <p v-if="rec.busy.value === 'scan'" class="muted">Prepoznajem…</p>
          <template v-else-if="verdict">
            <template v-if="verdict.label">
              <p class="v-label" :style="{ borderColor: zoneOf(verdict.label)?.color ?? 'var(--border2)' }">
                <span class="v-dot" :style="{ background: zoneOf(verdict.label)?.color ?? 'var(--muted)' }" />
                {{ pretty(verdict.label) }}
              </p>
              <p class="muted mono">sigurnost {{ pct(verdict.score) }}</p>
              <dl v-if="zoneOf(verdict.label)" class="catalog">
                <dt>Cena</dt><dd>{{ zoneOf(verdict.label).price }}</dd>
                <dt>SMS</dt><dd class="mono">{{ zoneOf(verdict.label).sms_shortcode || "—" }}</dd>
                <!-- Only where every lot of the zone sells it (Novi Sad: White). In the
                     Blue zone a few lots do, and the zone sign alone does not say which. -->
                <dt v-if="dailyAll(verdict.label)">Dnevna</dt>
                <dd v-if="dailyAll(verdict.label)">
                  {{ zoneOf(verdict.label).daily_amount }} RSD → {{ zoneOf(verdict.label).daily_target }}
                </dd>
                <dt>Pravila</dt><dd>{{ zoneOf(verdict.label).rules }}</dd>
              </dl>
              <p v-else class="muted">Za ovu vrstu table nema reda u katalogu.</p>
            </template>
            <p v-else class="v-none">Ne prepoznajem ovu tablu.</p>
            <ol class="cands">
              <li v-for="r in verdict.ranked.slice(0, 3)" :key="r.label">
                <span>{{ pretty(r.label) }}</span>
                <span class="mono">{{ pct(r.score) }}</span>
              </li>
            </ol>
          </template>
        </div>
      </div>
    </section>

    <!-- ── Examples ── -->
    <section v-if="tab === 'teach'" class="pane">
      <div class="teach">
        <label class="field">
          <span>Grad</span>
          <select id="lab-city" v-model="city">
            <option value="novi-sad">Novi Sad</option>
            <option value="other">Drugi grad…</option>
          </select>
        </label>
        <label v-if="city === 'other'" class="field">
          <span>Ime grada</span>
          <input id="lab-city-name" v-model="otherCity" placeholder="npr. beograd" />
        </label>
        <label class="field">
          <span>Vrsta table</span>
          <select v-if="city === 'novi-sad'" id="lab-zone" v-model="zone">
            <option v-for="z in nsZones" :key="z.name" :value="z.name">{{ zoneLabel(z.name) }}</option>
            <option value="Dodatna tabla">Dodatna tabla</option>
            <option value="Nije tabla zone">Nije tabla zone</option>
          </select>
          <input v-else id="lab-zone-text" v-model="zone" placeholder="npr. Crvena zona" />
        </label>
        <label class="pick" :class="{ off: !canTeach }">
          <input type="file" accept="image/*" multiple :disabled="!canTeach" @change="onTeach" />
          <Icon name="plus" :size="18" /> Dodaj fotografije kao primere
        </label>
      </div>

      <div class="row">
        <button type="button" class="btn" :disabled="!!rec.busy.value" @click="importReports">
          Uvezi potvrđene skenove iz baze
        </button>
        <span v-if="progress" class="muted mono">{{ progress }}</span>
      </div>

      <div v-for="c in classes" :key="c.label" class="cls">
        <p class="cls-head">
          <b>{{ pretty(c.label) }}</b>
          <span class="muted">{{ c.photos.length }} fotografija</span>
        </p>
        <ul class="thumbs">
          <li v-for="p in c.photos" :key="p.photoId">
            <img :src="p.thumb" :alt="pretty(c.label)" />
            <button type="button" class="thumb-x" :aria-label="`Obriši primer: ${pretty(c.label)}`" @click="rec.remove(p.photoId)">×</button>
          </li>
        </ul>
      </div>

      <div class="row">
        <button type="button" class="btn btn-quiet" @click="download">Izvezi primere (JSON)</button>
        <label class="btn btn-quiet">
          Uvezi JSON <input type="file" accept="application/json" hidden @change="onImportJson" />
        </label>
        <button type="button" class="btn btn-danger" @click="confirmReset = !confirmReset">Obriši sve</button>
        <button v-if="confirmReset" type="button" class="btn btn-danger" @click="doReset">Da, obriši sve primere</button>
      </div>
      <textarea v-if="exported" class="export" readonly :value="exported" aria-label="Izvezeni primeri" />
    </section>

    <!-- ── Test ── -->
    <section v-if="tab === 'test'" class="pane">
      <p class="muted">
        Svaka fotografija se prepoznaje modelom naučenim na svim ostalim (bez nje same), kao da je
        nova. Broj koji mora da ostane nula: <b>pogrešno, a sigurno</b>. "Ne zna" je pošten odgovor.
      </p>
      <div class="row">
        <button type="button" class="btn" :disabled="testing || classes.length < 2" @click="runTest">
          Pokreni test
        </button>
        <span v-if="testProgress" class="muted mono">{{ testProgress }}</span>
      </div>
      <div class="sliders">
        <label class="field">
          <span>Najmanja sigurnost za odgovor <b class="mono">{{ pct(th.minProb) }}</b></span>
          <input id="lab-minprob" v-model.number="th.minProb" type="range" min="0.5" max="0.99" step="0.01" />
        </label>
      </div>

      <div v-if="results.length" class="score">
        <p><b class="mono">{{ summary.right }}/{{ summary.total }}</b> tačno</p>
        <p :class="{ bad: summary.wrong.length }"><b class="mono">{{ summary.wrong.length }}</b> pogrešno, a sigurno</p>
        <p><b class="mono">{{ summary.abstain }}</b> ne zna</p>
      </div>
      <p v-else class="empty">
        {{ classes.length < 2 ? "Za test treba bar dve vrste tabli sa po nekoliko fotografija." : "Pokreni test." }}
      </p>

      <table v-if="results.length" class="per">
        <thead><tr><th>Vrsta</th><th>Tačno</th><th>Pogrešno</th><th>Ne zna</th></tr></thead>
        <tbody>
          <tr v-for="r in perClass" :key="r.label">
            <td>{{ pretty(r.label) }}</td>
            <td class="mono">{{ r.right }}/{{ r.total }}</td>
            <td class="mono" :class="{ bad: r.wrong }">{{ r.wrong }}</td>
            <td class="mono">{{ r.abstain }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="summary.wrong.length" class="mistakes">
        <h2>Pogrešno, a sigurno</h2>
        <ul class="thumbs big">
          <li v-for="w in summary.wrong" :key="w.photoId">
            <img :src="thumbOf(w.photoId)" alt="" />
            <span>{{ pretty(w.truth) }} → <b>{{ pretty(w.verdict.label!) }}</b></span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Lab page, behind runtimeConfig.public.labPages: the prototype for recognising
// sign kinds on the device (see useSignRecognizer for how it works).
if (!useRuntimeConfig().public.labPages) throw createError({ statusCode: 404, statusMessage: 'Not found' })

useHead({ title: 'Prepoznavanje tabli · Kerb lab', meta: [{ name: 'robots', content: 'noindex' }] })

const { zoneLabel } = useLang()
const rec = useSignRecognizer()
const supabase = useSupabaseClient<any>()
const { getCity } = useCity()

const tabs = [
  { id: 'scan', label: 'Prepoznaj' },
  { id: 'teach', label: 'Primeri' },
  { id: 'test', label: 'Test' },
] as const
const tab = ref<'scan' | 'teach' | 'test'>('scan')

const statusText = computed(
  () =>
    ({ idle: 'Model nije učitan', loading: 'Učitavam model…', ready: 'Model spreman', error: `Greška: ${rec.error.value}` })[
      rec.status.value
    ],
)

// The catalogue: Novi Sad's registry rows, so a recognised kind answers with the
// city's real price and SMS code rather than anything read off the photo.
const nsZones = ref<any[]>([])
const catalog = ref<Record<string, any[]>>({})
// Zones whose every mapped lot sells the daily ticket, from the city geometry.
const dailyZones = ref<Set<string>>(new Set())
onMounted(async () => {
  await rec.refresh()
  try {
    const ns = await getCity('novi-sad')
    nsZones.value = ns?.zones ?? []
    catalog.value = { 'novi-sad': nsZones.value }
    const geo = await fetch('/zones/novi-sad.json').then((r) => (r.ok ? r.json() : null))
    const byZone = new Map<string, boolean>()
    for (const f of geo?.features ?? []) {
      const z = f.properties?.zone
      if (z) byZone.set(z, (byZone.get(z) ?? true) && f.properties?.daily === true)
    }
    dailyZones.value = new Set([...byZone].filter(([, all]) => all).map(([z]) => `novi-sad · ${z}`))
  } catch {}
  if (!zone.value && nsZones.value[0]) zone.value = nsZones.value[0].name
  rec.ready().catch(() => {})
})

const split = (label: string) => {
  const i = label.indexOf(' · ')
  return { city: label.slice(0, i), zone: label.slice(i + 3) }
}
const pretty = (label: string) => {
  const { city, zone: z } = split(label)
  return `${city === 'novi-sad' ? 'Novi Sad' : city} · ${zoneLabel(z)}`
}
const dailyAll = (label: string) => !!zoneOf(label)?.daily_amount && dailyZones.value.has(label)
const zoneOf = (label: string) => {
  const { city, zone: z } = split(label)
  return catalog.value[city]?.find((r: any) => r.name === z) ?? null
}

// ── recognise ──
const scanUrl = ref<string | null>(null)
const verdict = ref<SignVerdict | null>(null)
const onScan = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (scanUrl.value) URL.revokeObjectURL(scanUrl.value)
  scanUrl.value = URL.createObjectURL(file)
  verdict.value = null
  rec.busy.value = 'scan'
  try {
    const q = await rec.embedQuery(file)
    verdict.value = decideSign(rec.recognize(q), th)
  } finally {
    rec.busy.value = null
  }
}

// ── teach ──
const city = ref<'novi-sad' | 'other'>('novi-sad')
const otherCity = ref('')
const zone = ref('')
const canTeach = computed(() => !!zone.value.trim() && (city.value === 'novi-sad' || !!otherCity.value.trim()))
const progress = ref('')
const onTeach = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  const c = city.value === 'novi-sad' ? 'novi-sad' : otherCity.value.trim().toLowerCase()
  rec.busy.value = 'teach'
  try {
    for (const [i, f] of files.entries()) {
      progress.value = `Učim ${i + 1}/${files.length}…`
      await rec.teach(f, { city: c, zone: zone.value.trim() })
    }
    await rec.refresh()
  } finally {
    rec.busy.value = null
    progress.value = ''
    input.value = ''
  }
}

// The scans people already confirmed in the app are labelled examples for free.
const importReports = async () => {
  rec.busy.value = 'import'
  try {
    const { data, error } = await supabase
      .from('sign_reports')
      .select('id, city_id, zone_name, photo_path')
      .not('photo_path', 'is', null)
    if (error) throw error
    const have = new Set(rec.photos.value.map((p) => p.source))
    const todo = (data ?? []).filter((r: any) => r.zone_name && !have.has(`sign_reports:${r.id}`))
    for (const [i, r] of todo.entries()) {
      progress.value = `Uvozim ${i + 1}/${todo.length}…`
      const url = supabase.storage.from('sign-photos').getPublicUrl(r.photo_path).data.publicUrl
      const blob = await fetch(url).then((res) => (res.ok ? res.blob() : null))
      if (!blob) continue
      await rec.teach(blob, { city: r.city_id, zone: r.zone_name, source: `sign_reports:${r.id}` })
    }
    await rec.refresh()
    progress.value = todo.length ? `Uvezeno ${todo.length}.` : 'Sve je već uvezeno.'
  } catch (e: any) {
    progress.value = `Uvoz nije uspeo: ${e?.message ?? e}`
  } finally {
    rec.busy.value = null
  }
}

const classes = computed(() => {
  const m = new Map<string, SignPhoto[]>()
  for (const p of rec.photos.value) m.set(p.label, [...(m.get(p.label) ?? []), p])
  return [...m.entries()].map(([label, photos]) => ({ label, photos })).sort((a, b) => b.photos.length - a.photos.length)
})

const exported = ref('')
const download = () => {
  exported.value = rec.exportJson()
}
const onImportJson = async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    await rec.importJson(await f.text())
    progress.value = 'Primeri uvezeni.'
  } catch (err: any) {
    progress.value = err?.message ?? String(err)
  }
}
const confirmReset = ref(false)
const doReset = async () => {
  await rec.reset()
  confirmReset.value = false
}

// ── test ──
const th = reactive<SignThresholds>({ ...SIGN_THRESHOLDS })
const pct = (x: number) => `${Math.round(x * 100)}%`
const results = ref<SignTestRow[]>([])
const testing = ref(false)
const testProgress = ref('')
const runTest = async () => {
  testing.value = true
  try {
    results.value = await rec.test((done, total) => (testProgress.value = `Učim i testiram ${done}/${total}…`))
    testProgress.value = ''
  } finally {
    testing.value = false
  }
}
const summary = computed(() => summarizeSignTest(results.value, th))
const perClass = computed(() =>
  classes.value.map(({ label }) => {
    const rows = summary.value.decided.filter((r) => r.truth === label)
    return {
      label,
      total: rows.length,
      right: rows.filter((r) => r.verdict.label === label).length,
      wrong: rows.filter((r) => r.verdict.label && r.verdict.label !== label).length,
      abstain: rows.filter((r) => !r.verdict.label).length,
    }
  }),
)
const thumbOf = (photoId: string) => rec.photos.value.find((p) => p.photoId === photoId)?.thumb ?? ''
</script>

<style scoped>
.lab {
  max-width: 760px;
  padding-block: 24px 64px;
  display: grid;
  gap: 18px;
}
.lab-head h1 {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.lab-sub {
  margin-top: 6px;
  color: var(--text2);
  max-width: 62ch;
}
.lab-meta {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--muted);
}
.chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg3);
  color: var(--text2);
}
.chip--ready { background: var(--green-bg); color: var(--green); }
.chip--error { background: var(--red-bg); color: var(--red); }
.chip--loading { background: var(--amber-bg); color: var(--amber); }

.tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab.on {
  color: var(--text);
  border-bottom-color: var(--text);
}
.tab:focus-visible,
.btn:focus-visible,
.pick:focus-within {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.pane {
  display: grid;
  gap: 16px;
}
.empty,
.muted {
  color: var(--muted);
  font-size: 14px;
}
.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.pick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 20px;
  font-size: 15px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--accent);
  border-radius: var(--r-md);
  cursor: pointer;
}
.pick input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.pick.off {
  opacity: 0.5;
  cursor: not-allowed;
}

.scan {
  display: grid;
  grid-template-columns: minmax(0, 220px) 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 560px) {
  .scan { grid-template-columns: 1fr; }
}
.scan-img {
  width: 100%;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
}
.verdict {
  display: grid;
  gap: 8px;
}
.v-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  font-size: 18px;
  font-weight: 700;
  background: var(--bg2);
  border: 2px solid;
  border-radius: var(--r-md);
}
.v-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}
.v-none {
  padding: 12px 14px;
  font-weight: 700;
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  border-radius: var(--r-md);
}
.catalog {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 14px;
}
.catalog dt {
  color: var(--muted);
}
.cands {
  display: grid;
  gap: 4px;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text2);
}
.cands li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.teach {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: end;
}
.field {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.field select,
.field input:not([type="range"]) {
  padding: 10px 12px;
  font: inherit;
  font-size: 15px;
  color: var(--text);
  background: var(--bg2);
  border: 1.5px solid var(--border2);
  border-radius: var(--r-md);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: var(--bg2);
  border: 1.5px solid var(--text2);
  border-radius: var(--r-md);
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-quiet {
  border-color: var(--border2);
}
.btn-danger {
  color: var(--red);
  border-color: var(--red-border);
}
.cls {
  display: grid;
  gap: 8px;
}
.cls-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 6px;
  list-style: none;
  padding: 0;
}
.thumbs li {
  position: relative;
}
.thumbs img {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.thumb-x {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  font-size: 14px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border: none;
  border-radius: 50%;
}
.thumbs.big {
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
}
.thumbs.big li {
  display: grid;
  gap: 4px;
  font-size: 12px;
}
.export {
  width: 100%;
  min-height: 120px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.sliders {
  display: grid;
  gap: 10px;
}
.score {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.score p {
  padding: 10px 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.bad {
  color: var(--red);
}
.per {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.per th,
.per td {
  padding: 8px 6px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.mistakes h2 {
  font-size: 16px;
  margin-bottom: 8px;
}
</style>
