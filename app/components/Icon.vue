<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </template>
    <template v-else-if="name === 'city'">
      <path d="M4 21V7l6-4v18" /><path d="M10 9h6a2 2 0 0 1 2 2v10" /><path d="M2 21h20" />
      <path d="M7 9h.01M7 13h.01M7 17h.01M14 13h.01M14 17h.01" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
    </template>
    <template v-else-if="name === 'plus'">
      <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" />
    </template>
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="4" /><path d="M5 21v-1a7 7 0 0 1 14 0v1" />
    </template>
    <template v-else-if="name === 'pin'">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </template>
    <template v-else-if="name === 'sign'">
      <path d="M12 3v3M12 13v8M8 21h8" /><path d="M5 6h12.5L20 9.5 17.5 13H5z" />
    </template>
    <template v-else-if="name === 'camera'">
      <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </template>
    <template v-else-if="name === 'ai'">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </template>
    <template v-else-if="name === 'bell'">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </template>
    <template v-else-if="name === 'alert'">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </template>
    <template v-else-if="name === 'parking'">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </template>
    <template v-else-if="name === 'car'">
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <path d="M4 11h16a1 1 0 0 1 1 1v5h-2M3 17H2v-5a1 1 0 0 1 1-1" />
      <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M9 17h6" />
    </template>
    <template v-else-if="name === 'expand'">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </template>
    <template v-else-if="name === 'nav-arrow'">
      <path d="M12 2 19 21l-7-4-7 4z" />
    </template>
    <template v-else-if="name === 'compass'">
      <circle cx="12" cy="12" r="9" /><path d="M15.5 8.5 14 14l-5.5 1.5L10 10z" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </template>
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  name:
    | 'home' | 'city' | 'clock' | 'plus' | 'user' | 'pin' | 'sign' | 'camera'
    | 'ai' | 'moon' | 'bell' | 'alert' | 'parking' | 'car' | 'expand'
    | 'nav-arrow' | 'compass' | 'check'
  size?: number
}>(), { size: 16 })
</script>

<style scoped>
.icon { display: inline-block; vertical-align: -0.15em; flex-shrink: 0; }
</style>
