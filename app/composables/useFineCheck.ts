// ── FINE CHECK ─────────────────────────────────────────────────────────────────
// Manual, on-demand check of a single plate against the official Novi Sad records,
// via our /api/fine-check proxy. The on-ramp to proactive (push) fine monitoring.

export interface Fine {
  ticketNo: number | null
  plate: string
  amount: number
  status: string | null
  statusCode: number | null
  recipient: string | null
  city: string | null
  dueBy: string | null
  qrcode: string | null
}

export interface FineResult {
  plate: string
  hasFines: boolean
  count: number
  totalDue: number
  currency: string
  fines: Fine[]
  checkedAt: string
}

export const useFineCheck = () => {
  const { t } = useLang()
  const result = ref<FineResult | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  const check = async (plate: string) => {
    const clean = plate.trim().toUpperCase().replace(/[\s-]/g, '')
    if (clean.length < 4) { error.value = t('enterValidPlate'); return }
    pending.value = true
    error.value = null
    result.value = null
    try {
      result.value = await $fetch<FineResult>('/api/fine-check', { query: { plate: clean } })
    } catch (e: any) {
      error.value = e?.data?.statusMessage || e?.statusMessage || t('fineCheckFail')
    } finally {
      pending.value = false
    }
  }

  const reset = () => { result.value = null; error.value = null }

  return { result, pending, error, check, reset }
}
