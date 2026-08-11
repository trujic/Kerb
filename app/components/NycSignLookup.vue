<!-- ── WHAT THE SIGN SAYS ────────────────────────────────────────────────────────
     New York publishes every parking sign as data, so for once the app can show
     what is written on the plate before the driver is standing under it. Name the
     street, name the block, read both sides.

     It stops at the block on purpose. Which end of the block a rule reaches is
     drawn as an arrow on the plate, and until that is read properly the honest
     unit is "this block, this side" — not "this parking space". -->
<template>
  <div class="nsl">
    <p class="nsl-label">What the sign says</p>
    <p class="nsl-sub">
      New York publishes every parking sign. Name a block and read both sides
      before you drive there.
    </p>

    <form class="nsl-form" @submit.prevent="findStreet">
      <input
        v-model="q"
        class="nsl-input"
        type="text"
        placeholder="e.g. 3 Avenue"
        aria-label="Street name"
      />
      <button class="nsl-btn" type="submit" :disabled="q.trim().length < 2 || busy">
        {{ busy ? '…' : 'Look up' }}
      </button>
    </form>

    <p v-if="error" class="nsl-error">{{ error }}</p>

    <!-- Ambiguous: "3 Avenue" also matches "103 Avenue" -->
    <div v-if="streets.length" class="nsl-picks">
      <p class="nsl-pick-label">Which street?</p>
      <button
        v-for="s in streets"
        :key="s.name"
        class="nsl-pick"
        type="button"
        @click="pickStreet(s.name)"
      >
        {{ s.name }} <span class="nsl-count">{{ s.signs }} signs</span>
      </button>
    </div>

    <div v-if="blocks.length" class="nsl-picks">
      <p class="nsl-pick-label">Which block of {{ street }}?</p>
      <button
        v-for="b in blocks"
        :key="b.from + b.to"
        class="nsl-pick"
        type="button"
        @click="pickBlock(b.from)"
      >
        {{ tidy(b.from) }} → {{ tidy(b.to) }}
        <span class="nsl-count">{{ b.signs }}</span>
      </button>
    </div>

    <div v-if="block" class="nsl-result">
      <p class="nsl-block">
        {{ tidy(block.street) }} · {{ tidy(block.from) }} → {{ tidy(block.to) }}
        <span v-if="block.borough" class="nsl-boro">{{ block.borough }}</span>
      </p>
      <p v-if="block.payByCellNumber" class="nsl-parknyc">
        ParkNYC number for this block: <strong>{{ block.payByCellNumber }}</strong>
      </p>

      <div v-for="(rules, side) in block.sides" :key="side" class="nsl-side">
        <p class="nsl-side-name">{{ sideName(String(side)) }} side</p>
        <div v-for="(r, i) in rules" :key="i" class="nsl-rule" :class="r.kind">
          <span class="nsl-dot" />
          <div class="nsl-rule-body">
            <p class="nsl-rule-main">{{ phrase(r) }}</p>
            <p class="nsl-rule-meta">
              <span v-if="r.feetFromCorner != null">{{ r.feetFromCorner }} ft from the corner</span>
              <span v-if="r.posts > 1"> · {{ r.posts }} plates</span>
              <span v-if="r.dated"> · sign dated {{ r.dated }}</span>
            </p>
          </div>
        </div>
      </div>

      <p class="nsl-foot">
        {{ block.signsShown }} of {{ block.signsTotal }} records shown — bus and
        route panels dropped. Newest sign on this block: {{ block.newestSign ?? 'unknown' }}.
        Source: NYC Open Data. The plate on the street is still the one that counts.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const q = ref('')
const busy = ref(false)
const error = ref('')
const streets = ref<{ name: string; signs: number }[]>([])
const blocks = ref<{ on: string; from: string; to: string; signs: number }[]>([])
const street = ref('')
const block = ref<any>(null)

/** The dataset writes "EAST   85 STREET" with the padding it uses internally. */
const tidy = (s: string | null) =>
  (s ?? '').replace(/\s+/g, ' ').trim().replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())

const sideName = (s: string) =>
  ({ N: 'North', S: 'South', E: 'East', W: 'West' } as Record<string, string>)[s] ?? s

const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

/** Turn the parsed sign back into a sentence a driver can act on. */
const phrase = (r: any) => {
  const days = r.days?.length
    ? r.days.length === 7 ? 'every day' : r.days.map((d: string) => DAY_SHORT[d] ?? d).join(', ')
    : r.except?.length
      ? `every day except ${r.except.map((d: string) => DAY_SHORT[d] ?? d).join(', ')}`
      : 'every day'
  const when = r.from && r.to ? `${r.from}–${r.to}` : ''
  const at = [days, when].filter(Boolean).join(' ')

  switch (r.kind) {
    case 'metered':
      return `Metered${r.commercialOnly ? ', commercial vehicles only' : ''}${
        r.maxHours ? `, max ${r.maxHours}h` : ''
      } — ${at}`
    case 'street-cleaning':
      return `Street cleaning — move the car ${at}`
    case 'no-standing':
      return `No standing — ${at}${r.schoolDays ? ' (school days)' : ''}`
    case 'no-parking':
      return `No parking — ${at}`
    case 'no-stopping':
      return `No stopping — ${at}`
    case 'bus-stop':
      return 'Bus stop — no standing'
    case 'pay-by-cell':
      return 'Pay-by-phone available on this block'
    default:
      return r.text
  }
}

const call = async (params: Record<string, string>) => {
  busy.value = true
  error.value = ''
  try {
    return await $fetch<any>('/api/nyc-signs', { params })
  } catch (e: any) {
    error.value = e?.statusMessage || 'Could not reach the city data right now.'
    return null
  } finally {
    busy.value = false
  }
}

const reset = () => { streets.value = []; blocks.value = []; block.value = null }

const findStreet = async () => {
  reset()
  const d = await call({ street: q.value.trim() })
  if (!d) return
  if (d.mode === 'streets') streets.value = d.streets
  else { street.value = d.street; blocks.value = d.blocks }
}

const pickStreet = async (name: string) => {
  reset()
  // exact: the name came from the city's own list, so stop matching by substring.
  const d = await call({ street: name, exact: '1' })
  if (!d) return
  if (d.mode === 'blocks') { street.value = d.street; blocks.value = d.blocks }
}

const pickBlock = async (from: string) => {
  const d = await call({ street: street.value, from })
  if (!d) return
  streets.value = []
  blocks.value = []
  block.value = d
}
</script>

<style scoped>
.nsl {
  padding: 14px;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: var(--r-md);
}
.nsl-label { font-size: 13px; font-weight: 700; color: var(--text); }
.nsl-sub { margin-top: 3px; font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.nsl-form { display: flex; gap: 8px; margin-top: 10px; }
.nsl-input {
  flex: 1; min-width: 0; padding: 9px 11px; font-family: inherit; font-size: 14px;
  border: 1px solid var(--border2); border-radius: var(--r-sm, 8px); background: var(--bg);
  color: var(--text);
}
.nsl-btn {
  padding: 9px 14px; border: none; border-radius: var(--r-sm, 8px);
  background: var(--blue); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.nsl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.nsl-error { margin-top: 8px; font-size: 12.5px; color: #B4232B; }
.nsl-picks { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
.nsl-pick-label { width: 100%; font-size: 12px; color: var(--muted); }
.nsl-pick {
  padding: 6px 10px; border: 1px solid var(--border2); border-radius: 999px;
  background: var(--bg); font-family: inherit; font-size: 12.5px; color: var(--text2); cursor: pointer;
}
.nsl-count { color: var(--muted); font-size: 11px; }
.nsl-result { margin-top: 14px; }
.nsl-block { font-size: 13.5px; font-weight: 700; color: var(--text); }
.nsl-boro { margin-left: 6px; font-weight: 500; font-size: 12px; color: var(--muted); }
.nsl-parknyc { margin-top: 4px; font-size: 12.5px; color: var(--text2); }
.nsl-side { margin-top: 12px; }
.nsl-side-name {
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
.nsl-rule { display: flex; gap: 8px; align-items: flex-start; margin-top: 7px; }
.nsl-dot {
  flex-shrink: 0; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%;
  background: var(--text2);
}
.nsl-rule.metered .nsl-dot { background: #2F6FDB; }
.nsl-rule.street-cleaning .nsl-dot { background: #E6A700; }
.nsl-rule.no-standing .nsl-dot,
.nsl-rule.no-stopping .nsl-dot,
.nsl-rule.no-parking .nsl-dot { background: #B4232B; }
.nsl-rule.bus-stop .nsl-dot { background: #7A5AF8; }
.nsl-rule-main { font-size: 13px; color: var(--text); line-height: 1.45; }
.nsl-rule-meta { font-size: 11.5px; color: var(--muted); }
.nsl-foot { margin-top: 14px; font-size: 11.5px; color: var(--muted); line-height: 1.5; }
</style>
