// Chrome fires beforeinstallprompt once, as soon as it decides the app is
// installable — usually before the dashboard has mounted. Miss it and there is
// no second chance in that page life, so it is caught here at plugin time
// rather than inside the component that eventually shows the button.

import { captureInstallPrompt } from '~/composables/useInstallPrompt'

export default defineNuxtPlugin(() => {
  const offered = useState('kerb-install-offered', () => false)

  window.addEventListener('beforeinstallprompt', (e) => {
    // Without this Chrome shows its own mini-infobar and ours never gets a turn.
    e.preventDefault()
    captureInstallPrompt(e)
    offered.value = true
  })
})
