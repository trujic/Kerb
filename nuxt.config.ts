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
      title: 'Kerbo — park · pay · zero fines',
      meta: [
        { name: 'description', content: 'AI-assisted street parking for Serbia. Find your zone, pay by SMS, never learn what a zone is.' },
        { name: 'theme-color', content: '#F2F3F5' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Kerbo' },
        { property: 'og:title', content: 'Kerbo — park · pay · zero fines' },
        { property: 'og:description', content: 'AI-assisted street parking for Serbia. Find your zone, pay by SMS, never learn what a zone is.' },
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
      routes: ['/', '/cities', '/contribute', '/roadmap'],
      failOnError: false,
    },
  },
})
