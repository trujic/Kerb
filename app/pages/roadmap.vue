<template>
  <div class="roadmap-page">
    <section class="page-hero">
      <div class="container">
        <p class="section-label">Product roadmap</p>
        <h1>Where Kerb is going.</h1>
        <p class="hero-sub">
          Everything we're building — from the information layer to payments to
          community data. Updated as the product evolves.
        </p>
      </div>
    </section>

    <section class="roadmap-body">
      <div class="container">
        <div
          v-for="phase in phases"
          :key="phase.title"
          class="phase"
          :class="`phase--${phase.status}`"
        >
          <div class="phase-header">
            <div class="phase-meta">
              <span class="phase-badge" :class="`badge--${phase.status}`">
                {{ statusLabel[phase.status] }}
              </span>
              <span class="phase-title">{{ phase.title }}</span>
            </div>
            <p class="phase-desc">{{ phase.description }}</p>
          </div>

          <div class="items">
            <div
              v-for="item in phase.items"
              :key="item.label"
              class="item"
              :class="`item--${item.status}`"
            >
              <span class="item-icon">
                {{ item.status === 'done' ? '✓' : item.status === 'progress' ? '◐' : '○' }}
              </span>
              <div class="item-body">
                <div class="item-label">{{ item.label }}</div>
                <div v-if="item.note" class="item-note">{{ item.note }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const statusLabel: Record<string, string> = {
  done: 'Shipped',
  progress: 'In progress',
  next: 'Up next',
  planned: 'Planned',
  future: 'Future',
}

const phases = [
  {
    title: 'Phase 1 — Information layer',
    status: 'done',
    description: 'The core product. Every city has a structured guide: zones, prices, payment methods, SMS codes, local tips and a disclaimer pointing to the official source.',
    items: [
      { status: 'done', label: 'City pages — zones, prices, hours, payment methods, tips' },
      { status: 'done', label: 'Search with autocomplete' },
      { status: 'done', label: 'GPS city detection on homepage' },
      { status: 'done', label: 'Disclaimer system — last confirmed date + official source link' },
      { status: 'done', label: 'Contribute form — community corrections' },
      { status: 'done', label: '10 Serbian cities seeded (Belgrade, Novi Sad, Niš, Kragujevac, Subotica, Čačak, Vršac, Smederevo, Užice, Zaječar)' },
      { status: 'done', label: 'Clean utility design system — white, readable, mobile-first' },
    ],
  },
  {
    title: 'Phase 2 — User accounts',
    status: 'progress',
    description: 'Accounts exist to reduce friction for regular users — not to gate information. Everything in Phase 1 stays free and public forever.',
    items: [
      { status: 'done', label: 'Registration and login' },
      { status: 'done', label: 'Profile page — display name, default city, license plates' },
      { status: 'progress', label: 'Onboarding flow — city + plate setup immediately after signup', note: 'So the first time you open the app to pay, everything is already there' },
      { status: 'next', label: 'Guest checkout — pay without an account via Apple Pay / Google Pay', note: 'For travelers and one-time users. No registration barrier.' },
    ],
  },
  {
    title: 'Phase 3 — Payment layer',
    status: 'next',
    description: 'Kerb sends the SMS on your behalf. You pay by card or Apple/Google Pay — no Serbian phone number needed. This is the feature that makes Kerb uniquely useful for travelers.',
    items: [
      { status: 'next', label: 'SMS sent by Kerb — card payment → Kerb sends SMS to parking service', note: 'Solves the tourist problem: foreign phones can\'t send Serbian SMS shortcodes' },
      { status: 'next', label: 'Apple Pay & Google Pay via Stripe — one tap, no card details typed' },
      { status: 'next', label: 'Guest checkout — plate + zone + Apple Pay, no account needed' },
      { status: 'planned', label: 'Transparent service fee — small fixed fee per transaction' },
      { status: 'planned', label: 'Payment confirmation + receipt on screen' },
      { status: 'planned', label: 'Fee discount for registered users vs. guests — incentive to create account' },
    ],
  },
  {
    title: 'Phase 4 — Scan features',
    status: 'planned',
    description: 'The physical parking sign is the only truly accurate, always up-to-date data source. Scanning it solves two problems at once: faster payment for the user, and automatic data contribution to the database.',
    items: [
      { status: 'planned', label: 'Scan to pay — photo of parking sign → AI reads zone/price/SMS code → payment pre-filled', note: 'Every scan is also a community data contribution' },
      { status: 'planned', label: 'Plate scan — camera → OCR → auto-fills your license plate', note: 'Essential for rental cars and borrowed vehicles' },
      { status: 'planned', label: 'Quick plate flow — scan or type a one-time plate without saving to profile', note: 'Session-only, optional save after use' },
    ],
  },
  {
    title: 'Phase 5 — Community & trust',
    status: 'planned',
    description: 'Municipal websites are bad and parking rules change. The only sustainable way to keep data accurate is community verification — especially from people who park in those cities regularly.',
    items: [
      { status: 'planned', label: 'Local resident verification — users who set a home city can verify/flag data for that city' },
      { status: 'planned', label: 'Staleness detection — auto-flag cities not updated in 6+ months' },
      { status: 'planned', label: 'Contribution approval workflow — admin queue for reviewing submitted updates' },
      { status: 'planned', label: 'City coverage map — shows which cities have data and which are requested' },
      { status: 'planned', label: 'Change log per city — what was updated and when' },
    ],
  },
  {
    title: 'Phase 6 — Monetization',
    status: 'planned',
    description: 'Revenue comes from the payment layer, not from selling ads or gating information. The information layer stays free forever.',
    items: [
      { status: 'planned', label: 'Service fee on SMS transactions — small margin per payment processed' },
      { status: 'planned', label: 'Affiliate links to parking apps — earn per install when users are sent to nSpark, EasyPark, etc.' },
      { status: 'planned', label: 'Public API — structured parking data for travel apps, GPS providers, fleet software' },
    ],
  },
  {
    title: 'Phase 7 — Regional expansion',
    status: 'future',
    description: 'Serbia first, then the Western Balkans corridor, then broader Europe. Expand along routes people actually drive — not randomly by country.',
    items: [
      { status: 'future', label: 'Montenegro — Podgorica, Budva, Bar, Kotor' },
      { status: 'future', label: 'Croatia — Zagreb, Split, Dubrovnik, Rijeka' },
      { status: 'future', label: 'Slovenia — Ljubljana, Maribor' },
      { status: 'future', label: 'Bulgaria, Romania, Bosnia & Herzegovina' },
      { status: 'future', label: 'Country landing pages — overview of parking rules per country' },
      { status: 'future', label: 'URL restructure — /country/city for better SEO at scale' },
    ],
  },
]

useSeoMeta({
  title: 'Roadmap — Kerb',
  description: 'Where Kerb is going — from parking information to payments to community data.',
})
</script>

<style scoped>
.roadmap-page { padding: 0 0 80px; }

.page-hero {
  padding: 100px 0 48px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.1;
  margin-bottom: 14px;
}
.hero-sub {
  font-size: 16px;
  color: var(--muted);
  max-width: 520px;
  line-height: 1.7;
}

.roadmap-body { padding-top: 56px; }

.phase {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 48px;
  padding: 48px 0;
  border-bottom: 1px solid var(--border);
  align-items: start;
}
.phase:last-child { border-bottom: none; }

.phase-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.phase-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.phase-desc {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.65;
}

.phase-badge {
  font-size: 10px;
  font-family: var(--font-mono);
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.badge--done     { background: var(--green-bg);  border: 1px solid var(--green-border); color: var(--green); }
.badge--progress { background: var(--blue-bg);   border: 1px solid var(--blue-border);  color: var(--blue); }
.badge--next     { background: var(--amber-bg);  border: 1px solid var(--amber-border); color: var(--amber); }
.badge--planned  { background: var(--bg3);       border: 1px solid var(--border2);      color: var(--muted); }
.badge--future   { background: var(--bg3);       border: 1px solid var(--border2);      color: var(--muted2); }

.items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  align-items: flex-start;
}
.item--done     { background: var(--bg2); }
.item--progress { background: var(--blue-bg); border: 1px solid var(--blue-border); }
.item--next     { background: var(--amber-bg); border: 1px solid var(--amber-border); }
.item--planned  { background: transparent; }
.item--future   { background: transparent; opacity: 0.6; }

.item-icon {
  font-size: 13px;
  flex-shrink: 0;
  margin-top: 2px;
  font-family: var(--font-mono);
  width: 16px;
}
.item--done     .item-icon { color: var(--green); }
.item--progress .item-icon { color: var(--blue); }
.item--next     .item-icon { color: var(--amber); }
.item--planned  .item-icon { color: var(--muted2); }
.item--future   .item-icon { color: var(--muted2); }

.item-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.4;
}
.item--planned .item-label,
.item--future  .item-label { font-weight: 400; color: var(--text2); }

.item-note {
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .phase { grid-template-columns: 1fr; gap: 24px; padding: 36px 0; }
}
</style>
