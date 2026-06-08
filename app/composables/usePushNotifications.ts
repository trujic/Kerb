// ── WEB PUSH ──────────────────────────────────────────────────────────────────
// Registers the push-only service worker, requests permission, and stores the
// subscription in Supabase so the scheduled function can send expiry reminders.

const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export const usePushNotifications = () => {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const userId = computed(() => (user.value as any)?.id ?? (user.value as any)?.sub ?? null)
  const vapidKey = useRuntimeConfig().public.vapidPublicKey as string

  const supported = ref(false)
  const permission = ref<NotificationPermission>('default')
  const enabled = ref(false)       // subscribed on this device
  const busy = ref(false)
  const error = ref<string | null>(null)

  const refresh = async () => {
    if (!import.meta.client) return
    supported.value =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported.value) return
    permission.value = Notification.permission
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      enabled.value = !!sub
    } catch { enabled.value = false }
  }

  const enable = async () => {
    error.value = null
    if (!import.meta.client) return
    if (!supported.value) { error.value = 'Notifications aren’t supported on this device.'; return }
    if (!vapidKey) { error.value = 'Push is not configured (missing VAPID key).'; return }
    if (!userId.value) { error.value = 'Sign in to enable reminders.'; return }

    busy.value = true
    try {
      const perm = await Notification.requestPermission()
      permission.value = perm
      if (perm !== 'granted') {
        error.value = perm === 'denied'
          ? 'Notifications are blocked — enable them in your browser settings.'
          : 'Notification permission was dismissed.'
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }

      const json = sub.toJSON()
      await supabase.from('push_subscriptions').upsert({
        user_id: userId.value,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
      }, { onConflict: 'endpoint' })

      enabled.value = true
    } catch (e: any) {
      console.warn('[Kerb] push enable failed:', e)
      error.value = 'Could not enable reminders. Try again.'
    } finally {
      busy.value = false
    }
  }

  const disable = async () => {
    error.value = null
    if (!import.meta.client) return
    busy.value = true
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      enabled.value = false
    } catch (e) {
      console.warn('[Kerb] push disable failed:', e)
    } finally {
      busy.value = false
    }
  }

  onMounted(refresh)

  return { supported, permission, enabled, busy, error, enable, disable, refresh }
}
