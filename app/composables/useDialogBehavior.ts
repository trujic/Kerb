// Shared behavior for fullscreen dialogs and sheets: Escape closes, initial
// focus moves into the dialog, and focus returns to the opener on close.
// Call from a component that IS the dialog (mounted = open).
export const useDialogBehavior = (
  close: () => void,
  initialFocus?: () => HTMLElement | null | undefined,
) => {
  let opener: HTMLElement | null = null

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
  }

  onMounted(() => {
    opener = document.activeElement as HTMLElement | null
    window.addEventListener('keydown', onKey)
    nextTick(() => initialFocus?.()?.focus?.())
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    opener?.focus?.()
  })
}
