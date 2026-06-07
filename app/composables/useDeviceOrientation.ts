export const useDeviceOrientation = () => {
  const heading = ref<number | null>(null)
  const needsPermission = ref(false)
  let _handler: ((e: DeviceOrientationEvent) => void) | null = null

  const _attach = () => {
    _handler = (e: DeviceOrientationEvent) => {
      const wkh = (e as any).webkitCompassHeading
      if (typeof wkh === 'number' && !isNaN(wkh)) {
        heading.value = wkh
      } else if (typeof e.alpha === 'number') {
        heading.value = (360 - e.alpha) % 360
      }
    }
    window.addEventListener('deviceorientationabsolute', _handler as EventListener, true)
    window.addEventListener('deviceorientation', _handler as EventListener, true)
  }

  const start = async () => {
    if (!import.meta.client || !window.DeviceOrientationEvent) return

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // iOS 13+ — needs user gesture to request
      needsPermission.value = true
      return
    }

    _attach()
  }

  // Call this from a button click on iOS
  const requestPermission = async () => {
    try {
      const perm = await (DeviceOrientationEvent as any).requestPermission()
      if (perm === 'granted') {
        needsPermission.value = false
        _attach()
      }
    } catch {
      needsPermission.value = false
    }
  }

  const stop = () => {
    if (_handler) {
      window.removeEventListener('deviceorientationabsolute', _handler as EventListener, true)
      window.removeEventListener('deviceorientation', _handler as EventListener, true)
      _handler = null
    }
    heading.value = null
  }

  return { heading, needsPermission, start, requestPermission, stop }
}
