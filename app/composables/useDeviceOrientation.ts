export const useDeviceOrientation = () => {
  const heading = ref<number | null>(null)
  let _handler: ((e: DeviceOrientationEvent) => void) | null = null
  let _attached = false
  let _disarmGesture: (() => void) | null = null

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

  const _needsPermission = () =>
    typeof (DeviceOrientationEvent as any)?.requestPermission === 'function'

  // Calls iOS's requestPermission. MUST start synchronously inside a user
  // gesture on iOS (the requestPermission() call itself is sync; only the
  // result is awaited). Returns true once orientation events are attached.
  const _request = async (): Promise<boolean> => {
    if (_attached) return true
    if (!_needsPermission()) { _attach(); return true }
    try {
      const perm = await (DeviceOrientationEvent as any).requestPermission()
      if (perm === 'granted') { _attach(); return true }
    } catch { /* called outside a gesture, or denied */ }
    return false
  }

  // iOS only: prompt on the user's first interaction *anywhere*, so the compass
  // turns on without the user having to find the map. One-shot — Safari only
  // shows the dialog once per origin anyway.
  const _armGesture = () => {
    if (_disarmGesture || _attached || !import.meta.client) return
    const events = ['pointerdown', 'touchend', 'click', 'keydown']
    const onGesture = () => {
      _disarm()                 // one-shot: detach before awaiting the result
      void _request()
    }
    for (const ev of events) {
      window.addEventListener(ev, onGesture, { capture: true, passive: true })
    }
    _disarmGesture = () => {
      for (const ev of events) window.removeEventListener(ev, onGesture, true)
      _disarmGesture = null
    }
  }

  const _disarm = () => { _disarmGesture?.() }

  const start = async () => {
    if (!import.meta.client || !window.DeviceOrientationEvent) return

    if (_needsPermission()) {
      // Try silently (succeeds if already granted this session); otherwise arm
      // the first-gesture prompt. Either way the user never hunts for the map.
      const granted = await _request()
      if (!granted) _armGesture()
      return
    }

    _attach() // Android & others: no permission needed, starts immediately
  }

  // Optional explicit retry from a known gesture (e.g. tapping the map).
  const onMapTap = async () => { await _request() }

  const stop = () => {
    _disarm()
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
