export const useDeviceOrientation = () => {
  const heading = ref<number | null>(null)
  let _handler: ((e: DeviceOrientationEvent) => void) | null = null
  let _attached = false

  const _attach = () => {
    if (_attached) return
    _attached = true
    _handler = (e: DeviceOrientationEvent) => {
      const wkh = (e as any).webkitCompassHeading
      if (typeof wkh === 'number' && !isNaN(wkh)) {
        // iOS: degrees clockwise from North
        heading.value = wkh
      } else if (typeof e.alpha === 'number') {
        // Android: alpha counterclockwise, convert to clockwise from North
        heading.value = (360 - e.alpha) % 360
      }
    }
    window.addEventListener('deviceorientationabsolute', _handler as EventListener, true)
    window.addEventListener('deviceorientation', _handler as EventListener, true)
  }

  const start = async () => {
    if (!import.meta.client || !window.DeviceOrientationEvent) return

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // iOS 13+: permission required — try silently first, activate on map tap via onMapTap()
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission()
        if (perm === 'granted') _attach()
      } catch {
        // Will be retried on user gesture via onMapTap
      }
      return
    }

    _attach()
  }

  // Call this from a user gesture (map tap) — works for iOS permission
  const onMapTap = async () => {
    if (_attached || !import.meta.client) return
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission()
        if (perm === 'granted') _attach()
      } catch { /* denied */ }
    }
  }

  const stop = () => {
    if (_handler) {
      window.removeEventListener('deviceorientationabsolute', _handler as EventListener, true)
      window.removeEventListener('deviceorientation', _handler as EventListener, true)
      _handler = null
    }
    _attached = false
    heading.value = null
  }

  return { heading, start, stop, onMapTap }
}
