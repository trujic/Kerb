export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2025-01-01',

  modules: [
    '@nuxtjs/supabase',
    '@nuxtjs/google-fonts',
  ],

  supabase: {
    redirect: false,
  },

  googleFonts: {
    families: {
      'DM Sans': [400, 500, 600, 700],
      'DM Mono': [400, 500],
    },
    display: 'swap',
  },

  app: {
    head: {
      title: 'Kerb — Street Parking Guide',
      meta: [
        { name: 'description', content: 'Parking rules for any city in Europe. Zones, prices, payment methods and local tips.' },
        { name: 'theme-color', content: '#2563EB' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Kerb' },
        { property: 'og:title', content: 'Kerb — Street Parking Guide' },
        { property: 'og:description', content: 'Parking rules for any city, organized.' },
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
