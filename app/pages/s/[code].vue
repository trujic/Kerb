<!--
  ── ЗА ПРОЛАЗНИКА ────────────────────────────────────────────────────────────
  This page is the only one in Kerb written for somebody who is not a user, has
  never heard of the product, and is reading it over a stranger's shoulder while
  being asked for a favour. So it is in Serbian, it is short, and it asks for
  exactly one thing.

  It never mentions Kerb before it says what is wanted. A passer-by decides in
  two seconds whether this is a scam; the plate, the amount and a Send button
  answer that faster than any explanation could.
-->
<template>
  <div class="wrap">
    <div v-if="loading" class="state">Учитавање…</div>

    <div v-else-if="error" class="state bad">
      <p class="big">Овај захтев више није активан.</p>
      <p>Можда је већ плаћен. Не треба ништа да радите.</p>
    </div>

    <template v-else>
      <p class="ask">Можете ли да пошаљете ову поруку?</p>
      <p class="sub">Возач нема српски број и не може сам да плати паркинг.</p>

      <div class="card">
        <div class="row"><span>Таблица</span><b class="plate">{{ d.plate }}</b></div>
        <div class="row"><span>Зона</span><b>{{ d.zone }}</b></div>
        <div class="row"><span>Шаље се на</span><b>{{ target }}</b></div>
        <div class="row total"><span>Цена</span><b>{{ costLabel }}</b></div>
      </div>

      <button class="send" @click="send">
        Пошаљи SMS
      </button>

      <p v-if="!useDaily && d.repeat > 1" class="repeat">
        Паркинг се плаћа на сат. За {{ d.minutes }} минута
        <b>притисните пошаљи {{ d.repeat }} пута</b> — порука остаје иста.
      </p>
      <p v-else-if="useDaily" class="repeat ok">
        Дневна карта — једна порука покрива цео дан.
      </p>

      <p class="money">
        Возач вам враћа одмах, на лицу места —
        <b>{{ d.total ? d.total + ' динара' : 'колико кошта' }}</b><span v-if="coin">, или {{ coin }}</span>.
      </p>

      <p class="foot">
        Порука се наплаћује са вашег броја, као и свако плаћање паркинга SMS-ом.
        Ништа се не инсталира и нигде се не региструјете.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const d = ref<any>(null)
const loading = ref(true)
const error = ref(false)

// One message beats three, and where the zone sells a daily ticket it is
// usually cheaper than the hours it replaces.
const useDaily = computed(() => !!d.value?.daily && (d.value?.repeat ?? 1) > 1)
const target = computed(() => (useDaily.value ? d.value.daily.target : d.value?.shortcode))
const costLabel = computed(() => {
  if (!d.value) return ''
  if (useDaily.value) return `${d.value.daily.amount} RSD (дневна)`
  return d.value.price ? `${d.value.price}${d.value.repeat > 1 ? ` × ${d.value.repeat}` : ''}` : '—'
})

// A visitor who has no Serbian SIM very often has no Serbian cash either, but
// almost always has a euro coin. Naming one removes the change-making problem
// from a favour that is supposed to take ten seconds.
const coin = computed(() => {
  const t = d.value?.total
  if (t == null) return null
  if (t <= 110) return 'кованица од 1 €'
  if (t <= 230) return 'кованица од 2 €'
  return null
})

const send = () => {
  if (!target.value) return
  openSms(smsHref(String(target.value), d.value.plate))
}

onMounted(async () => {
  try {
    d.value = await $fetch('/api/relay/passerby', { query: { code: String(route.params.code) } })
  } catch { error.value = true }
  loading.value = false
})

useHead({ title: 'Плаћање паркинга' })
</script>

<style scoped>
.wrap { max-width: 440px; margin: 0 auto; padding: 28px 18px 60px; }
.state { text-align: center; padding: 60px 0; color: var(--ink-2, #555); }
.state.bad .big { font-size: 1.2rem; font-weight: 600; color: var(--ink, #16181c); }

.ask { font-size: 1.45rem; font-weight: 700; line-height: 1.25; margin: 0 0 6px; }
.sub { color: var(--ink-2, #555); margin: 0 0 22px; }

.card { border: 1.5px solid var(--line, #e3e6ea); border-radius: 12px; padding: 4px 16px; background: var(--card, #fff); }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--line, #e3e6ea); }
.row:last-child { border-bottom: none; }
.row span { color: var(--ink-3, #78808a); font-size: .9rem; }
.row b { font-weight: 600; }
.plate { font-family: ui-monospace, monospace; font-size: 1.25rem; letter-spacing: .05em; }
.total b { font-size: 1.1rem; }

.send { width: 100%; margin-top: 20px; padding: 18px; border: 0; border-radius: 12px;
  background: var(--accent, #f5c400); color: var(--on-accent, #16181c);
  font: inherit; font-weight: 700; font-size: 1.15rem; cursor: pointer; }

.repeat { margin: 14px 0 0; font-size: .95rem; color: var(--amber, #b45309); }
.repeat.ok { color: var(--green, #10673e); }
.money { margin: 18px 0 0; font-size: 1rem; font-weight: 600; }
.foot { margin: 20px 0 0; font-size: .85rem; color: var(--ink-3, #78808a); line-height: 1.5; }
</style>
