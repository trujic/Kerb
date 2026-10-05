export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2025-01-01',

  modules: [
    '@nuxtjs/supabase',
    '@nuxtjs/google-fonts',
  ],

  runtimeConfig: {
    public: {
      // VAPID public key for Web Push (safe to expose; private key stays server-side)
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
      // Where the site lives. Canonical links, share previews and QR codes are
      // built from this, so moving domains is an env change, not a code search.
      // Override with NUXT_PUBLIC_SITE_URL.
      siteUrl: 'https://kerb.rs',
      // Cities shown to the public. A city enters when its numbers have been
      // checked against the operator's own site; everything else gets the honest
      // "not covered yet" answer. Comma-separated ids — NUXT_PUBLIC_LIVE_CITIES.
      liveCities: 'novi-sad',
      // Pay-for-me / relay. Needs a person on call and holds guests' money, so it
      // stays off the public surface until both are settled. NUXT_PUBLIC_RELAY_PUBLIC=true
      relayPublic: false,
      // Privacy-friendly analytics (Plausible). Empty = no script, no events.
      // NUXT_PUBLIC_PLAUSIBLE_DOMAIN=kerb.rs
      plausibleDomain: '',
      // The /lab prototypes (sign recognition, AR-lite) on the live site, unlinked
      // and noindex, so they can be tried on a real phone over HTTPS while there
      // are no users. Turn off before launch: NUXT_PUBLIC_LAB_PAGES=false.
      labPages: true,
    },
  },

  supabase: {
    redirect: false,
  },

  googleFonts: {
    families: {
      'Saira': [400, 500, 600, 700],
      'Saira Stencil One': [400],
      'DM Mono': [400, 500],
    },
    display: 'swap',
  },

  app: {
    head: {
      title: 'Kerb — ulično parkiranje, konačno jasno',
      htmlAttrs: { lang: 'sr-Latn' },
      meta: [
        { name: 'description', content: 'Zona, cena, do kad si pokriven i kako se plaća u Novom Sadu — iz zvaničnih izvora, sa datumom provere. Tabla pored auta ima poslednju reč.' },
        { name: 'theme-color', content: '#F2F3F5' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Kerb' },
        { property: 'og:title', content: 'Kerb — ulično parkiranje, konačno jasno' },
        { property: 'og:description', content: 'Zona, cena, do kad si pokriven i kako se plaća u Novom Sadu — iz zvaničnih izvora, sa datumom provere.' },
        { property: 'og:type', content: 'website' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' },
        { rel: 'manifest', href: '/manifest.json' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  nitro: {
    preset: process.env.NITRO_PRESET || undefined,
    prerender: {
      routes: ['/', '/cities', '/contribute', '/roadmap', '/privatnost', '/uslovi'],
      failOnError: false,
    },
  },
})
