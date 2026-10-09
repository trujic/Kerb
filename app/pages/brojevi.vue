<!--
  ── BROJEVI ──────────────────────────────────────────────────────────────────
  Kerb's own daily totals, for whoever keeps it (ADMIN_USER_IDS, else the relay
  list). Unlinked and noindex. What the table holds is all it can show: a day, an
  event, a city, a short label and a number; nobody can be found in it.

  "SMS pripremljen" is the honest name for what Kerb sees: the composer opened
  with the plate. Whether the message went out, Kerb does not know.
-->
<template>
  <div class="wrap">
    <header class="top">
      <h1>Brojevi</h1>
      <span class="sub">poslednjih 30 dana</span>
      <button class="refresh" :disabled="loading" aria-label="Osveži" @click="load">↻</button>
    </header>

    <p v-if="error" class="note">{{ error }}</p>
    <p v-else-if="loading && !rows.length" class="note">Učitavam…</p>
    <p v-else-if="!rows.length" class="note">Još nema nijednog događaja.</p>

    <template v-else>
      <table class="totals">
        <thead>
          <tr>
            <th scope="col">Događaj</th>
            <th scope="col">Danas</th>
            <th scope="col">7 dana</th>
            <th scope="col">30 dana</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in events" :key="e.event">
            <th scope="row">{{ label(e.event) }}</th>
            <td>{{ e.today }}</td>
            <td>{{ e.week }}</td>
            <td>{{ e.month }}</td>
          </tr>
        </tbody>
      </table>

      <section v-for="e in events" :key="'k' + e.event" class="kinds">
        <h2>{{ label(e.event) }}</h2>
        <ul>
          <li v-for="k in e.kinds" :key="k.kind">
            <span class="kind">{{ k.kind || '—' }}</span>
            <span class="n">{{ k.n }}</span>
          </li>
        </ul>
      </section>

      <p class="foot">
        Dani su po beogradskom vremenu. Brojevi sa razvojnog servera i iz automatskih testova se ne
        računaju. "SMS pripremljen" znači da je otvoren SMS sa tablicom; da li je poslat, Kerb ne vidi.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Brojevi · Kerb', meta: [{ name: 'robots', content: 'noindex' }] })

const LABELS: Record<string, string> = {
  'Zone shown': 'Prikazana zona',
  'SMS opened': 'SMS pripremljen',
  'Sign scanned': 'Skenirana tabla',
  'Returned after 7+ days': 'Vratio se posle 7+ dana',
  'Location failed': 'Lokacija nije uspela',
  'Zone picked': 'Zona izabrana sa spiska',
  'Car placed': 'Kola postavljena',
}
const ORDER = Object.keys(LABELS)
const label = (e: string) => LABELS[e] ?? e

type Row = { day: string; event: string; city: string; kind: string; count: number }
const rows = ref<Row[]>([])
const loading = ref(false)
const error = ref('')

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    rows.value = (await $fetch<{ rows: Row[] }>('/api/counts')).rows
  } catch (e: any) {
    const code = e?.statusCode ?? e?.response?.status
    error.value =
      code === 401 || code === 403
        ? 'Samo za administratora: prijavi se nalogom sa ADMIN_USER_IDS liste.'
        : e?.data?.statusMessage ?? e?.statusMessage ?? 'Brojevi nisu stigli.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// "Today" in Belgrade, the same day the database counted in.
const dayIn = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' })

const events = computed(() => {
  const today = dayIn(0)
  const weekFrom = dayIn(6)
  const by = new Map<string, { event: string; today: number; week: number; month: number; kinds: Map<string, number> }>()
  for (const r of rows.value) {
    const e = by.get(r.event) ?? { event: r.event, today: 0, week: 0, month: 0, kinds: new Map() }
    e.month += r.count
    if (r.day >= weekFrom) e.week += r.count
    if (r.day === today) e.today += r.count
    e.kinds.set(r.kind, (e.kinds.get(r.kind) ?? 0) + r.count)
    by.set(r.event, e)
  }
  return [...by.values()]
    .sort((a, b) => (ORDER.indexOf(a.event) + 1 || 99) - (ORDER.indexOf(b.event) + 1 || 99))
    .map((e) => ({
      ...e,
      kinds: [...e.kinds.entries()].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n),
    }))
})
</script>

<style scoped>
.wrap {
  max-width: 640px;
  margin: 0 auto;
  padding: 16px 16px 60px;
}
.top {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}
h1 {
  font-size: 1.4rem;
  margin: 0;
}
.sub,
.note,
.foot {
  color: var(--muted);
}
.sub {
  font-size: 0.9rem;
}
.note {
  padding: 20px 0;
}
.refresh {
  margin-left: auto;
  width: 34px;
  height: 34px;
  font-size: 1rem;
  color: inherit;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.totals {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.totals th,
.totals td {
  padding: 10px 8px;
  text-align: right;
  border-bottom: 1px solid var(--border);
}
.totals th:first-child {
  text-align: left;
  font-weight: 600;
}
.totals thead th {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.totals td {
  font-family: var(--font-mono);
}
.kinds {
  margin-top: 22px;
}
.kinds h2 {
  margin: 0 0 6px;
  font-size: 0.95rem;
}
.kinds ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.kinds li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
}
.kind {
  color: var(--text2);
}
.n {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.foot {
  margin-top: 24px;
  font-size: 13px;
  line-height: 1.5;
}
</style>
