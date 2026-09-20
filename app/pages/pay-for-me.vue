<!--
  ── PAY FOR ME ───────────────────────────────────────────────────────────────
  For the visitor whose phone cannot send the payment: no local SIM, no local
  app, no account. They give a plate, a zone and a duration, and somebody with a
  local number does it for them.

  Two rules the screen is built around:

  1. Nobody waits on a blank spinner. The wait is visible, it is counted, and
     after two minutes the page offers the ways they can pay without us.
  2. "Paid" is only ever the operator's own message, shown verbatim with the
     plate in it. Our own word for it would be worth nothing at the windscreen.
-->
<template>
  <div class="wrap">
    <!-- ── ASKING ─────────────────────────────────────────────────────────── -->
    <section v-if="!token" class="card">
      <h1>Pay for me</h1>
      <p class="sub">No Serbian SIM? Someone local sends the payment for your plate.</p>

      <label class="lbl">1 · Your plate</label>
      <PlateInput v-model="plate" placeholder="B-MK-1234" />

      <label class="lbl">2 · Zone</label>
      <p v-if="loadingZones" class="muted">Loading zones…</p>
      <div v-else class="zones">
        <button
          v-for="z in zones" :key="z.name" type="button"
          class="zone" :class="{ on: zone === z.name }"
          :style="{ '--z': z.color || 'var(--ink-3)' }"
          @click="zone = z.name"
        >
          <span class="dot" />
          <span class="zname">{{ z.name }}</span>
          <span class="zprice">{{ z.price || '—' }}</span>
        </button>
      </div>
      <p class="hint">
        Not sure? <NuxtLink to="/">Check the sign next to your car</NuxtLink> — the sign decides, not us.
      </p>

      <label class="lbl">3 · How long</label>
      <div class="durations">
        <button
          v-for="d in durations" :key="d.min" type="button"
          class="dur" :class="{ on: minutes === d.min, out: overCap(d.min) }"
          :disabled="overCap(d.min)"
          @click="minutes = d.min"
        >{{ d.label }}</button>
      </div>
      <!-- Greyed out with the reason attached, never removed: a driver standing
           in Extra Zone must learn that four hours is impossible there, not
           silently be offered a shorter list. -->
      <p v-if="maxStay" class="cap-note">
        {{ selectedZone?.name }} allows a maximum stay of {{ maxStay }} minutes.
        Longer is not expensive here — it is not permitted.
      </p>

      <p v-if="error" class="err">{{ error }}</p>

      <button class="go" :disabled="!canSend || sending" @click="send">
        {{ sending ? 'Sending…' : 'Ask someone to pay' }}
      </button>
      <p class="fine">
        We pass the request to a person with a local number. You will see their
        operator's reply, with your plate in it, as the receipt.
      </p>
    </section>

    <!-- ── WAITING / ANSWERED ─────────────────────────────────────────────── -->
    <section v-else class="card">
      <h1 class="status-h">{{ headline }}</h1>
      <p class="sub">{{ sub }}</p>

      <dl class="facts">
        <div><dt>Plate</dt><dd>{{ req?.plate || plate }}</dd></div>
        <div><dt>Zone</dt><dd>{{ req?.zone || zone }}</dd></div>
        <div><dt>Duration</dt><dd>{{ req?.minutes || minutes }} min</dd></div>
        <div v-if="req?.price_text"><dt>Quoted</dt><dd>{{ req.price_text }}</dd></div>
      </dl>

      <div v-if="waiting" class="waiting">
        <span class="pulse" /><span class="elapsed">{{ elapsedLabel }}</span>
      </div>

      <!-- The receipt: their words, not ours. -->
      <div v-if="req?.operator_reply" class="receipt">
        <span class="rlbl">The operator replied</span>
        <p class="rtext">{{ req.operator_reply }}</p>
      </div>
      <p v-if="req?.outcome_note" class="note">{{ req.outcome_note }}</p>

      <!-- Always reachable once the wait stops being short, and always after a
           failure or an unclear outcome. -->
      <div v-if="showFallback" class="fallback">
        <h2>{{ waiting ? 'Don’t keep waiting' : 'Pay it yourself instead' }}</h2>
        <p class="fb-lead">
          {{ waiting
            ? 'Nobody has picked this up yet. Charging does not pause while you wait, so use one of these now.'
            : 'These work without us, and without a Serbian number.' }}
        </p>
        <ol class="fb-list">
          <li>
            <strong>A kiosk near you</strong> — ask for a daily parking card
            (<em>dnevna parking karta</em>) for your zone. Cash works, no phone needed.
          </li>
          <li>
            <strong>The operator’s own app</strong> — nSpark takes foreign cards.
            <a href="https://play.google.com/store/apps/details?id=rs.parkingns.nspark" target="_blank" rel="noopener">Android</a>
            ·
            <a href="https://apps.apple.com/rs/app/nspark/id6505144660" target="_blank" rel="noopener">iPhone</a>
          </li>
          <li>
            <strong>Ask anyone standing near you.</strong> Show them this screen —
            it explains the favour in Serbian, and their phone does the rest.
          </li>
        </ol>
      </div>

      <!-- Shown to a stranger, so it is theirs to read, not the guest's: the
           address and the code are large because they will be typed by someone
           holding their own phone at arm's length. -->
      <section v-if="req?.code && waiting" class="passerby">
        <h2>Ask someone next to you</h2>
        <p class="pb-sub">
          Anyone with a Serbian number can send it in ten seconds. Show them this,
          and give them the cash — it explains the rest in Serbian.
        </p>
        <div class="pb-box">
          <span class="pb-url">kerb.rs/s/</span><span class="pb-code">{{ req.code }}</span>
        </div>
        <p class="pb-hint">They open that address on their own phone.</p>
      </section>

      <button class="ghost" @click="reset">New request</button>
    </section>
  </div>
</template>

<script setup lang="ts">
const CITY = 'novi-sad'
const STORE_KEY = 'kerb_relay_token'

const { getCity } = useCity()

const plate = ref('')
const zone = ref('')
const minutes = ref(60)
const zones = ref<any[]>([])
const loadingZones = ref(true)
const sending = ref(false)
const error = ref('')

const token = ref<string | null>(null)
const req = ref<any>(null)
const now = ref(Date.now())

const durations = [
  { min: 30, label: '30 min' },
  { min: 60, label: '1 h' },
  { min: 120, label: '2 h' },
  { min: 180, label: '3 h' },
  { min: 480, label: 'All day' },
]

const canSend = computed(() =>
  plate.value.trim().length >= 4 && !!zone.value && !overCap(minutes.value))

// Charging does not pause while a request sits unclaimed. Two minutes is the
// point at which telling somebody to keep waiting stops being help.
const WAIT_LIMIT_MS = 120_000

const selectedZone = computed(() => zones.value.find((z) => z.name === zone.value))

// The zone's own limit, read from the registry's rules. Null means unlimited.
const maxStay = computed<number | null>(() => {
  const z: any = selectedZone.value
  if (!z) return null
  if (z.max_minutes != null) return Number(z.max_minutes)
  const m = /max\s*(\d+)\s*min/i.exec(String(z.rules ?? ''))
  return m ? Number(m[1]) : null
})

const overCap = (mins: number) => maxStay.value != null && mins > maxStay.value

// If the chosen zone cannot hold the chosen duration, fall back to what it can.
watch(maxStay, (cap) => { if (cap != null && minutes.value > cap) minutes.value = cap })

const waiting = computed(() => req.value?.state === 'pending' || req.value?.state === 'working')

const elapsedMs = computed(() => {
  const start = req.value?.created_at ? new Date(req.value.created_at).getTime() : now.value
  return Math.max(0, now.value - start)
})
const elapsedLabel = computed(() => {
  const s = Math.floor(elapsedMs.value / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
})

// Two minutes is the point at which "someone is coming" stops being a useful
// thing to tell a person standing in a charged bay.
const showFallback = computed(() =>
  !req.value ? false
    : ['failed', 'unknown'].includes(req.value.state) || (waiting.value && elapsedMs.value > WAIT_LIMIT_MS))

const headline = computed(() => ({
  pending:   'Finding someone…',
  working:   'Someone is paying now',
  confirmed: 'Paid',
  failed:    'Not paid',
  unknown:   'We do not know',
}[req.value?.state as string] ?? 'Sent'))

const sub = computed(() => ({
  pending:   'Your request is with people who have a local number. If nobody answers within two minutes, use one of the options below.',
  working:   'They have opened it. This usually takes under a minute.',
  confirmed: 'The operator’s own message is below — that is your receipt.',
  failed:    'It could not be paid. Use one of the options below.',
  unknown:   'A message went out but no confirmation came back. Treat the car as unpaid until you have checked.',
}[req.value?.state as string] ?? ''))

let poll: ReturnType<typeof setInterval> | null = null
let tick: ReturnType<typeof setInterval> | null = null

const refresh = async () => {
  if (!token.value) return
  try {
    req.value = await $fetch('/api/relay/status', { query: { token: token.value } })
    if (!waiting.value && poll) { clearInterval(poll); poll = null }
  } catch { /* keep the last known state rather than blanking the screen */ }
}

const send = async () => {
  if (!canSend.value) return
  sending.value = true
  error.value = ''
  try {
    const res = await $fetch<{ token: string }>('/api/relay/request', {
      method: 'POST',
      body: {
        city: CITY,
        plate: plate.value,
        zone: zone.value,
        shortcode: selectedZone.value?.sms_shortcode ?? null,
        minutes: minutes.value,
        priceText: selectedZone.value?.price ?? null,
      },
    })
    token.value = res.token
    localStorage.setItem(STORE_KEY, res.token)
    await refresh()
    poll = setInterval(refresh, 3000)
  } catch (e: any) {
    error.value = e?.statusMessage || e?.data?.statusMessage || 'Could not send the request.'
  } finally {
    sending.value = false
  }
}

const reset = () => {
  if (poll) { clearInterval(poll); poll = null }
  localStorage.removeItem(STORE_KEY)
  token.value = null
  req.value = null
}

onMounted(async () => {
  tick = setInterval(() => { now.value = Date.now() }, 1000)

  const saved = localStorage.getItem(STORE_KEY)
  if (saved) {
    token.value = saved
    await refresh()
    if (waiting.value) poll = setInterval(refresh, 3000)
  }

  try {
    const city: any = await getCity(CITY)
    zones.value = (city?.zones ?? []).filter((z: any) => z.sms_shortcode || z.pay_target)
  } catch { /* the page still works; the guest just has fewer buttons */ }
  loadingZones.value = false
})

onUnmounted(() => {
  if (poll) clearInterval(poll)
  if (tick) clearInterval(tick)
})

useHead({ title: 'Pay for me · Kerb' })
</script>

<style scoped>
.wrap { max-width: 520px; margin: 0 auto; padding: 20px 16px 64px; }
.card { background: var(--card, #fff); border: 1px solid var(--line, #e3e6ea); border-radius: 14px; padding: 20px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { color: var(--ink-2, #555); margin: 0 0 18px; }
.lbl { display: block; font-size: .72rem; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-3, #78808a); margin: 18px 0 8px; }
.muted { color: var(--ink-3, #78808a); }

.zones { display: grid; gap: 8px; }
.zone { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 10px;
  padding: 12px 14px; border: 1.5px solid var(--line, #e3e6ea); border-radius: 10px;
  background: transparent; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.zone.on { border-color: var(--z); background: color-mix(in srgb, var(--z) 10%, transparent); }
.dot { width: 14px; height: 14px; border-radius: 4px; background: var(--z); }
.zname { font-weight: 600; }
.zprice { color: var(--ink-3, #78808a); font-size: .9rem; }
.hint { font-size: .86rem; color: var(--ink-3, #78808a); margin: 10px 0 0; }

.durations { display: flex; flex-wrap: wrap; gap: 8px; }
.dur { padding: 10px 14px; border: 1.5px solid var(--line, #e3e6ea); border-radius: 999px;
  background: transparent; cursor: pointer; font: inherit; color: inherit; }
.dur.on { border-color: var(--blue, #1a66d6); color: var(--blue, #1a66d6); font-weight: 600; }
.dur.out { opacity: .38; text-decoration: line-through; cursor: not-allowed; }
.cap-note { font-size: .85rem; color: var(--amber, #b45309); margin: 10px 0 0; }
.fb-lead { font-size: .92rem; color: var(--ink-2, #555); margin: 0 0 10px; }
.fb-list { margin: 0; padding-left: 1.2em; font-size: .92rem; color: var(--ink-2, #555); }
.fb-list li { margin-bottom: 10px; }
.fb-list a { color: var(--blue, #1a66d6); }

.go { width: 100%; margin-top: 22px; padding: 15px; border: 0; border-radius: 12px;
  background: var(--accent, #f5c400); color: var(--on-accent, #16181c);
  font: inherit; font-weight: 700; font-size: 1.05rem; cursor: pointer; }
.go:disabled { opacity: .45; cursor: not-allowed; }
.ghost { width: 100%; margin-top: 20px; padding: 12px; border: 1.5px solid var(--line, #e3e6ea);
  border-radius: 10px; background: transparent; font: inherit; color: var(--ink-2, #555); cursor: pointer; }
.fine { font-size: .82rem; color: var(--ink-3, #78808a); margin: 12px 0 0; }
.err { color: var(--amber, #b45309); font-size: .9rem; margin: 12px 0 0; }

.status-h { font-size: 1.7rem; }
.facts { display: grid; gap: 8px; margin: 18px 0; padding: 14px; border-radius: 10px;
  background: var(--surface-2, #f0f2f4); }
.facts > div { display: flex; justify-content: space-between; gap: 12px; }
dt { color: var(--ink-3, #78808a); font-size: .85rem; }
dd { margin: 0; font-weight: 600; }

.waiting { display: flex; align-items: center; gap: 10px; margin: 14px 0; }
.pulse { width: 10px; height: 10px; border-radius: 50%; background: var(--blue, #1a66d6); animation: p 1.4s ease-in-out infinite; }
@keyframes p { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
.elapsed { font-variant-numeric: tabular-nums; color: var(--ink-3, #78808a); }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; opacity: .8 } }

.receipt { margin: 16px 0; padding: 14px; border-radius: 10px;
  background: color-mix(in srgb, var(--green, #10673e) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--green, #10673e) 30%, transparent); }
.rlbl { font-size: .7rem; text-transform: uppercase; letter-spacing: .12em; color: var(--green, #10673e); }
.rtext { margin: 6px 0 0; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: .92rem; }
.note { color: var(--ink-2, #555); }

.fallback { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line, #e3e6ea); }
.fallback h2 { font-size: .95rem; margin: 0 0 8px; }
.passerby { margin-top: 22px; padding: 18px; border-radius: 12px;
  border: 2px solid var(--accent, #f5c400); background: var(--accent-bg, #fff6d1); }
.passerby h2 { font-size: 1.02rem; margin: 0 0 4px; }
.pb-sub { font-size: .9rem; color: var(--ink-2, #555); margin: 0 0 14px; }
.pb-box { text-align: center; padding: 14px 8px; background: var(--card, #fff);
  border-radius: 10px; font-family: ui-monospace, monospace; }
.pb-url { font-size: 1.15rem; color: var(--ink-2, #555); }
.pb-code { font-size: 1.9rem; font-weight: 700; letter-spacing: .12em; }
.pb-hint { text-align: center; font-size: .82rem; color: var(--ink-3, #78808a); margin: 10px 0 0; }
.fallback ul { margin: 0; padding-left: 1.1em; color: var(--ink-2, #555); font-size: .92rem; }
.fallback li { margin-bottom: 6px; }
</style>
