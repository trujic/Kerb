<!--
  ── RELAY CONSOLE ────────────────────────────────────────────────────────────
  The other end of /pay-for-me. One screen, meant to be used with a phone in one
  hand while the app or the SMS composer is open in the other.

  The design rule here is the same one that governs the rest of Kerb: the button
  that says "paid" is not available until the operator's own reply is pasted in.
  Everything else a relay could report — "I sent it", "I think it worked" — is a
  claim, and the guest is told it as a claim, under `unknown`.

  Access is an env list (RELAY_USER_IDS), not a role in the database.
-->
<template>
  <div class="wrap">
    <header class="top">
      <h1>Relay</h1>
      <span class="count">{{ open.length }} waiting</span>
      <button class="refresh" :disabled="loading" @click="load">↻</button>
    </header>

    <!-- Notifications live here, not on a settings page. This is the one screen
         whose whole value depends on being told, and an installed PWA has no
         address bar to reach an unlinked page with. -->
    <div class="notif" :class="{ off: !pushEnabled }">
      <Icon name="bell" :size="15" />
      <span class="notif-text">
        <template v-if="pushEnabled">Notifications on — a request will buzz this device.</template>
        <template v-else-if="pushSupported">Turn on notifications so a request reaches you.</template>
        <template v-else>{{ pushWhy }}</template>
      </span>
      <button v-if="pushSupported" class="notif-btn" :disabled="pushBusy" @click="togglePush">
        {{ pushBusy ? '…' : pushEnabled ? 'Off' : 'Enable' }}
      </button>
    </div>

    <p v-if="pushError" class="denied">{{ pushError }}</p>

    <!-- Cash comes in at a doorway, not through a payment gateway. Whoever took
         it records it here, and the balance is loaded before the guest asks for
         anything — which is the only order that works when they leave on Sunday. -->
    <details class="topup">
      <summary>Record a top-up</summary>
      <div class="tu-row">
        <input v-model="tuCode" class="tu-in" placeholder="Code" maxlength="4" autocapitalize="characters">
        <input v-model.number="tuAmount" class="tu-in" type="number" placeholder="RSD" min="1">
        <button class="tu-btn" :disabled="!tuCode || !tuAmount || tuBusy" @click="doTopup">
          {{ tuBusy ? '…' : 'Add' }}
        </button>
      </div>
      <p v-if="tuMsg" class="tu-msg">{{ tuMsg }}</p>
    </details>

    <p v-if="denied" class="denied">
      This account is not a relay. Add its user id to <code>RELAY_USER_IDS</code>.
    </p>

    <p v-else-if="!open.length && !loading" class="empty">Nothing waiting.</p>

    <!-- ── OPEN ─────────────────────────────────────────────────────────────── -->
    <article
      v-for="r in ordered" :key="r.id"
      class="job" :class="{ working: r.state === 'working', pinned: r.id === focusId }"
    >
      <p v-if="r.id === focusId" class="pinned-label">From the notification</p>
      <div class="head">
        <span class="plate">{{ r.plate }}</span>
        <span class="age" :class="{ old: age(r) > 120 }">{{ ageLabel(r) }}</span>
      </div>

      <div class="what">
        <span class="zone">{{ r.zone }}</span>
        <span class="dot">·</span>
        <span>{{ r.minutes }} min</span>
        <span v-if="r.price_text" class="dot">·</span>
        <span v-if="r.price_text">{{ r.price_text }}</span>
      </div>

      <p v-if="r.shortcode" class="sms">
        SMS <strong>{{ r.plate }}</strong> → <strong>{{ r.shortcode }}</strong>
        <span v-if="smsCount(r) > 1" class="repeat">× {{ smsCount(r) }} (one per hour)</span>
      </p>
      <p v-else class="sms muted">No shortcode for this zone — pay in the app.</p>

      <div class="actions">
        <button v-if="r.shortcode" class="primary" @click="sendSms(r)">Open SMS</button>
        <button class="secondary" @click="claim(r)">I'm on it</button>
      </div>

      <details class="close" :open="r.state === 'working'">
        <summary>Report the outcome</summary>
        <textarea
          v-model="replies[r.id]"
          rows="3"
          placeholder="Paste the operator's reply here — it contains the plate, and it is the guest's receipt."
        />
        <div class="outcomes">
          <button class="ok" :disabled="!replies[r.id]?.trim()" @click="answer(r, 'confirmed')">Paid</button>
          <button class="warn" @click="answer(r, 'unknown')">No reply came</button>
          <button class="bad" @click="answer(r, 'failed')">Could not pay</button>
        </div>
        <p class="why">“Paid” needs the reply pasted. Without it the guest gets “we do not know”, which is the truth.</p>
      </details>
    </article>

    <!-- ── TODAY ────────────────────────────────────────────────────────────── -->
    <section v-if="done.length" class="done">
      <h2>Answered today</h2>
      <div v-for="r in done" :key="r.id" class="row">
        <span class="badge" :class="r.state">{{ r.state }}</span>
        <span class="rplate">{{ r.plate }}</span>
        <span class="rzone">{{ r.zone }}</span>
        <span class="rtime">{{ timeOf(r.answered_at) }}</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const open = ref<any[]>([])
const done = ref<any[]>([])
const replies = reactive<Record<string, string>>({})
const loading = ref(false)
const denied = ref(false)
const now = ref(Date.now())

const {
  supported: pushSupported, enabled: pushEnabled, busy: pushBusy, error: pushError,
  enable: enablePush, disable: disablePush,
} = usePushNotifications()

const togglePush = () => (pushEnabled.value ? disablePush() : enablePush())

// Same reasoning as the reminders panel: name the reason rather than show
// nothing, because on iPhone the fix is two taps and the user cannot guess it.
const pushWhy = computed(() => {
  if (!import.meta.client) return ''
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  if (iOS) return 'On iPhone, add Kerb to the Home Screen first — Share → Add to Home Screen — then open it from there.'
  if (!window.isSecureContext) return 'Notifications need https. This page is not on a secure origin.'
  return 'This browser cannot show notifications.'
})

const route = useRoute()
const focusId = ref<string | null>(null)
let autoFired = false

// The job named in the notification sits first, so the relay never scrolls to
// find what just buzzed.
const ordered = computed(() => {
  if (!focusId.value) return open.value
  const hit = open.value.filter((r: any) => r.id === focusId.value)
  return [...hit, ...open.value.filter((r: any) => r.id !== focusId.value)]
})

const tuCode = ref('')
const tuAmount = ref<number | null>(null)
const tuBusy = ref(false)
const tuMsg = ref('')

const doTopup = async () => {
  tuBusy.value = true
  tuMsg.value = ''
  try {
    const r = await $fetch<{ balance: number }>('/api/wallet/topup', {
      method: 'POST',
      body: { code: tuCode.value.toUpperCase(), amount: tuAmount.value, note: 'cash' },
    })
    tuMsg.value = `Added. Balance is now ${r.balance} RSD.`
    tuCode.value = ''
    tuAmount.value = null
  } catch (e: any) {
    tuMsg.value = e?.statusMessage || e?.data?.statusMessage || 'Could not record that.'
  } finally {
    tuBusy.value = false
  }
}

const load = async () => {
  loading.value = true
  try {
    const res = await $fetch<{ open: any[]; done: any[] }>('/api/relay/queue')
    open.value = res.open
    done.value = res.done
    denied.value = false
  } catch (e: any) {
    if (e?.statusCode === 403) denied.value = true
  } finally {
    loading.value = false
  }
}

const age = (r: any) => Math.floor((now.value - new Date(r.created_at).getTime()) / 1000)
const ageLabel = (r: any) => {
  const s = age(r)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`
}
const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }) : ''

// The SMS pays for one hour. Three hours is three messages, and saying so is
// cheaper than a guest finding out from a ticket.
const smsCount = (r: any) => Math.max(1, Math.ceil((r.minutes ?? 60) / 60))

const sendSms = async (r: any) => {
  await claim(r)
  openSms(smsHref(r.shortcode, r.plate))
}

const claim = async (r: any) => {
  if (r.state === 'working') return
  r.state = 'working'
  try { await $fetch('/api/relay/answer', { method: 'POST', body: { id: r.id, action: 'claim' } }) }
  catch { /* the list reloads in a few seconds anyway */ }
}

const answer = async (r: any, action: 'confirmed' | 'failed' | 'unknown') => {
  try {
    await $fetch('/api/relay/answer', {
      method: 'POST',
      body: { id: r.id, action, reply: replies[r.id] ?? '' },
    })
    delete replies[r.id]
    await load()
  } catch (e: any) {
    alert(e?.statusMessage || e?.data?.statusMessage || 'Could not save that.')
  }
}

let poll: ReturnType<typeof setInterval> | null = null
let tick: ReturnType<typeof setInterval> | null = null

// `?go=sms` comes only from the notification's own action button, which is an
// explicit choice to send. It fires once: a reload must never re-send a payment.
const maybeAutoFire = () => {
  if (autoFired || route.query.go !== 'sms' || !focusId.value) return
  const job = open.value.find((r: any) => r.id === focusId.value)
  if (!job?.shortcode) return
  autoFired = true
  sendSms(job)
}

watch(open, maybeAutoFire)

onMounted(() => {
  focusId.value = (route.query.job as string) || null
  load().then(maybeAutoFire)
  poll = setInterval(load, 5000)
  tick = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (poll) clearInterval(poll)
  if (tick) clearInterval(tick)
})

useHead({ title: 'Relay · Kerb' })
</script>

<style scoped>
.wrap { max-width: 560px; margin: 0 auto; padding: 16px 14px 60px; }
.top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
h1 { font-size: 1.4rem; margin: 0; }
.count { color: var(--ink-3, #78808a); font-size: .9rem; }
.refresh { margin-left: auto; border: 1px solid var(--line, #e3e6ea); background: transparent;
  border-radius: 8px; width: 34px; height: 34px; cursor: pointer; font-size: 1rem; color: inherit; }
.denied, .empty { color: var(--ink-3, #78808a); padding: 20px 0; }
code { font-family: ui-monospace, monospace; font-size: .9em; }

.notif { display: flex; align-items: center; gap: 10px; padding: 11px 13px; margin-bottom: 14px;
  border: 1.5px solid var(--line, #e3e6ea); border-radius: 10px; background: var(--card, #fff); }
.notif.off { border-color: var(--amber, #b45309); }
.notif-text { flex: 1; font-size: .88rem; color: var(--ink-2, #555); line-height: 1.35; }
.notif-btn { padding: 8px 14px; border: 1.5px solid var(--blue, #1a66d6); border-radius: 8px;
  background: transparent; color: var(--blue, #1a66d6); font: inherit; font-weight: 600;
  font-size: .85rem; cursor: pointer; white-space: nowrap; }
.notif-btn:disabled { opacity: .5; cursor: not-allowed; }

.topup { margin-bottom: 14px; padding: 10px 13px; border: 1px solid var(--line, #e3e6ea);
  border-radius: 10px; background: var(--card, #fff); }
.topup summary { cursor: pointer; font-size: .88rem; color: var(--ink-2, #555); }
.tu-row { display: flex; gap: 8px; margin-top: 10px; }
.tu-in { flex: 1; min-width: 0; padding: 10px; border: 1.5px solid var(--line, #e3e6ea);
  border-radius: 8px; font: inherit; font-family: ui-monospace, monospace; background: var(--surface-2, #f0f2f4); color: inherit; }
.tu-btn { padding: 10px 18px; border: 0; border-radius: 8px; background: var(--accent, #f5c400);
  color: var(--on-accent, #16181c); font: inherit; font-weight: 700; cursor: pointer; }
.tu-btn:disabled { opacity: .45; cursor: not-allowed; }
.tu-msg { margin: 8px 0 0; font-size: .85rem; color: var(--ink-2, #555); }

.job { border: 1.5px solid var(--line, #e3e6ea); border-radius: 12px; padding: 14px; margin-bottom: 12px;
  background: var(--card, #fff); }
.job.working { border-color: var(--blue, #1a66d6); }
.job.pinned { border-color: var(--accent, #f5c400); border-width: 2.5px; }
.pinned-label { margin: 0 0 8px; font-size: .68rem; text-transform: uppercase;
  letter-spacing: .12em; color: var(--ink-3, #78808a); }
.head { display: flex; align-items: baseline; gap: 10px; }
.plate { font-family: ui-monospace, monospace; font-size: 1.25rem; font-weight: 700; letter-spacing: .04em; }
.age { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--ink-3, #78808a); font-size: .9rem; }
.age.old { color: var(--amber, #b45309); font-weight: 600; }

.what { margin-top: 4px; color: var(--ink-2, #555); }
.zone { font-weight: 600; color: var(--ink, #16181c); }
.dot { margin: 0 6px; color: var(--ink-3, #78808a); }

.sms { margin: 10px 0 0; font-size: .95rem; }
.sms.muted { color: var(--ink-3, #78808a); }
.repeat { color: var(--amber, #b45309); margin-left: 6px; font-weight: 600; }

.actions { display: flex; gap: 8px; margin-top: 12px; }
.primary { flex: 1; padding: 13px; border: 0; border-radius: 10px; font: inherit; font-weight: 700;
  background: var(--accent, #f5c400); color: var(--on-accent, #16181c); cursor: pointer; }
.secondary { padding: 13px 16px; border: 1.5px solid var(--line, #e3e6ea); border-radius: 10px;
  background: transparent; font: inherit; color: inherit; cursor: pointer; }

.close { margin-top: 12px; }
summary { cursor: pointer; font-size: .9rem; color: var(--ink-2, #555); }
textarea { width: 100%; margin-top: 10px; padding: 10px; border-radius: 8px; font: inherit;
  font-family: ui-monospace, monospace; font-size: .9rem; border: 1.5px solid var(--line, #e3e6ea);
  background: var(--surface-2, #f0f2f4); color: inherit; resize: vertical; }
.outcomes { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.outcomes button { flex: 1; min-width: 96px; padding: 11px; border-radius: 9px; border: 1.5px solid;
  background: transparent; font: inherit; font-weight: 600; cursor: pointer; }
.ok { border-color: var(--green, #10673e); color: var(--green, #10673e); }
.ok:disabled { opacity: .4; cursor: not-allowed; }
.warn { border-color: var(--amber, #b45309); color: var(--amber, #b45309); }
.bad { border-color: var(--ink-3, #78808a); color: var(--ink-3, #78808a); }
.why { font-size: .8rem; color: var(--ink-3, #78808a); margin: 10px 0 0; }

.done { margin-top: 26px; }
.done h2 { font-size: .78rem; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-3, #78808a); }
.row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line, #e3e6ea); }
.badge { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; padding: 3px 7px; border-radius: 4px; }
.badge.confirmed { background: color-mix(in srgb, var(--green, #10673e) 15%, transparent); color: var(--green, #10673e); }
.badge.failed, .badge.unknown { background: color-mix(in srgb, var(--amber, #b45309) 15%, transparent); color: var(--amber, #b45309); }
.rplate { font-family: ui-monospace, monospace; font-weight: 600; }
.rzone { color: var(--ink-3, #78808a); font-size: .9rem; }
.rtime { margin-left: auto; color: var(--ink-3, #78808a); font-variant-numeric: tabular-nums; font-size: .9rem; }
</style>
