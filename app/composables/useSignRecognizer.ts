// ── SIGN RECOGNIZER (PROTOTYPE) ───────────────────────────────────────────────
// Recognises WHICH kind of sign a photo shows, on the device, for free: no server
// and no per-scan cost. It does not read the sign. The rules (price, SMS code,
// limit) come from the city's registry row for the recognised zone, so a price
// sticker that changes 80 to 100 is a one-row change in the catalogue, not
// retraining.
//
// How: a pretrained image model (MobileNet v2) turns the middle of the photo into
// a vector; a small classifier trained on the stored examples says which kind of
// sign it is, with a probability. Teaching a new kind means adding photos of it;
// the classifier retrains in a second or two, the image model never changes.
//
// It answers "I don't recognise this" rather than guessing: a result counts only
// at or above a probability set against the leave-one-out test below, on real
// photos, with "wrong and confident" as the number that must stay at zero.
//
// Prototype only: the libraries load from a CDN at runtime and the examples live
// in this browser's IndexedDB (export/import moves them between devices).

const TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
const MOBILENET = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js'
const SIZE = 224

export interface SignExample {
  id: string
  photoId: string
  label: string        // "novi-sad · Extra Zone"
  kind: 'ref' | 'query' // refs are matched against; the query vector is what a test uses
  emb: number[]
}
export interface SignPhoto {
  photoId: string
  label: string
  city: string
  zone: string
  thumb: string        // small JPEG data URL, for the lists
  source: string       // 'upload' | 'sign_reports'
}
export interface SignRanked { label: string; score: number; best: number }
export interface SignVerdict {
  ranked: SignRanked[]
  label: string | null // null = "I don't recognise this"
  score: number
  margin: number
}
export interface SignThresholds { minProb: number }
// Set where the leave-one-out test on the 58 Novi Sad scans had no confident mistakes;
// re-check it whenever the examples grow.
export const SIGN_THRESHOLDS: SignThresholds = { minProb: 0.99 }

// Crops a reference photo is also learned from, so a slightly different framing
// or light at scan time still lands near it. Fractions of the shorter side.
type View = { s?: number; dx?: number; dy?: number; b?: number; r?: [number, number, number, number] }
// Street photos: the zone panel sits in the middle column, under the P sign, and
// the rest of the frame is road, cars and night — which a general image model
// happily matches on instead. So the views look at that column, not the scene.
const PANEL: [number, number, number, number] = [0.2, 0.15, 0.8, 0.85]
const jitter = (r: [number, number, number, number], d: number): [number, number, number, number] =>
  [r[0] + d, r[1] + d, r[2] + d, r[3] + d]
const REF_VIEWS: View[] = [
  { r: PANEL }, { r: jitter(PANEL, -0.05) }, { r: jitter(PANEL, 0.05) },
  { r: [0.25, 0.2, 0.75, 0.8] }, { r: PANEL, b: 0.75 }, { r: PANEL, b: 1.25 },
]
const QUERY_VIEWS: View[] = [{ r: PANEL }, { r: [0.25, 0.2, 0.75, 0.8] }]

// ── tiny IndexedDB store ──────────────────────────────────────────────────────
const DB = 'kerb-sign-lab'
const db = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('examples', { keyPath: 'id' })
      req.result.createObjectStore('photos', { keyPath: 'photoId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
const all = async <T>(store: string): Promise<T[]> => {
  const d = await db()
  return new Promise((resolve, reject) => {
    const r = d.transaction(store).objectStore(store).getAll()
    r.onsuccess = () => resolve(r.result as T[])
    r.onerror = () => reject(r.error)
  })
}
const put = async (store: string, rows: any[]) => {
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite')
    rows.forEach((row) => tx.objectStore(store).put(row))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
const clearStores = async () => {
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(['examples', 'photos'], 'readwrite')
    tx.objectStore('examples').clear()
    tx.objectStore('photos').clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
const removePhotoRows = async (photoId: string) => {
  const d = await db()
  const examples = (await all<SignExample>('examples')).filter((e) => e.photoId === photoId)
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(['examples', 'photos'], 'readwrite')
    examples.forEach((e) => tx.objectStore('examples').delete(e.id))
    tx.objectStore('photos').delete(photoId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── model ─────────────────────────────────────────────────────────────────────
const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`could not load ${src}`))
    document.head.appendChild(s)
  })

let modelPromise: Promise<any> | null = null
const loadModel = () => {
  modelPromise ??= (async () => {
    await loadScript(TFJS)
    await loadScript(MOBILENET)
    return (window as any).mobilenet.load({ version: 2, alpha: 1.0 })
  })()
  return modelPromise
}

const normalize = (v: Float32Array | number[]) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return Array.from(v, (x) => x / n)
}
const mean = (vs: number[][]) => normalize(vs[0]!.map((_, i) => vs.reduce((a, v) => a + v[i]!, 0) / vs.length))

const canvas = () => {
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  return c
}

const embedView = async (model: any, bmp: ImageBitmap, v: View) => {
  const c = canvas()
  const ctx = c.getContext('2d')!
  if (v.b) ctx.filter = `brightness(${v.b})`
  if (v.r) {
    const [x0, y0, x1, y1] = v.r.map((f) => Math.min(1, Math.max(0, f))) as [number, number, number, number]
    ctx.drawImage(bmp, x0 * bmp.width, y0 * bmp.height, (x1 - x0) * bmp.width, (y1 - y0) * bmp.height, 0, 0, SIZE, SIZE)
  } else {
    const s = v.s ?? 1
    const side = Math.min(bmp.width, bmp.height) * s
    const cx = bmp.width / 2 + (v.dx ?? 0) * Math.min(bmp.width, bmp.height)
    const cy = bmp.height / 2 + (v.dy ?? 0) * Math.min(bmp.width, bmp.height)
    const sx = Math.max(0, Math.min(bmp.width - side, cx - side / 2))
    const sy = Math.max(0, Math.min(bmp.height - side, cy - side / 2))
    ctx.drawImage(bmp, sx, sy, side, side, 0, 0, SIZE, SIZE)
  }
  const t = model.infer(c, true)
  const data = (await t.data()) as Float32Array
  t.dispose()
  return normalize(data)
}

const thumbOf = (bmp: ImageBitmap) => {
  const c = document.createElement('canvas')
  const w = 120
  c.width = w
  c.height = Math.round((bmp.height / bmp.width) * w)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.6)
}

const bitmapOf = (blob: Blob) => createImageBitmap(blob, { imageOrientation: 'from-image' })

// ── matching ──────────────────────────────────────────────────────────────────
// A small classifier trained on the example vectors (softmax regression, a few
// hundred steps, in plain JS). Nearest-neighbour matching was tried first and on
// 57 real street photos it was right 44 times and wrong with confidence 13 times:
// a general image model's notion of "similar" is the scene — night, cars, the P
// sign every zone shares — not the panel. A trained layer learns which parts of
// the vector actually separate Blue from Red; on the same photos it was right 52
// times, and at 97% confidence wrong none.
export interface SignHead { classes: string[]; W: Float32Array; b: Float32Array; mu: Float32Array; sd: Float32Array; dim: number }

export const trainSignHead = (rows: { label: string; emb: number[] }[], lambda = 0.01, steps = 300, rate = 0.5): SignHead | null => {
  const classes = [...new Set(rows.map((r) => r.label))].sort()
  if (classes.length < 2) return null
  const n = rows.length
  const dim = rows[0]!.emb.length
  const K = classes.length
  const X = new Float32Array(n * dim)
  rows.forEach((r, i) => X.set(r.emb, i * dim))
  // Standardise each dimension; keep the stats for prediction.
  const mu = new Float32Array(dim)
  const sd = new Float32Array(dim)
  for (let i = 0; i < n; i++) for (let j = 0; j < dim; j++) mu[j]! += X[i * dim + j]! / n
  for (let i = 0; i < n; i++) for (let j = 0; j < dim; j++) sd[j]! += (X[i * dim + j]! - mu[j]!) ** 2 / n
  for (let j = 0; j < dim; j++) sd[j] = Math.sqrt(sd[j]!) + 1e-6
  for (let i = 0; i < n; i++) for (let j = 0; j < dim; j++) X[i * dim + j] = (X[i * dim + j]! - mu[j]!) / sd[j]!
  const y = rows.map((r) => classes.indexOf(r.label))
  // Every kind weighs the same however many photos it has.
  const count = classes.map((_, k) => y.filter((v) => v === k).length)
  const w = y.map((k) => 1 / count[k]!)
  const wsum = w.reduce((a, x) => a + x, 0)
  const W = new Float32Array(dim * K)
  const b = new Float32Array(K)
  const Z = new Float32Array(K)
  const G = new Float32Array(n * K)
  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < n; i++) {
      let max = -Infinity
      for (let k = 0; k < K; k++) {
        let z = b[k]!
        for (let j = 0; j < dim; j++) z += X[i * dim + j]! * W[j * K + k]!
        Z[k] = z
        if (z > max) max = z
      }
      let sum = 0
      for (let k = 0; k < K; k++) { Z[k] = Math.exp(Z[k]! - max); sum += Z[k]! }
      for (let k = 0; k < K; k++) G[i * K + k] = ((Z[k]! / sum) - (y[i] === k ? 1 : 0)) * w[i]! / wsum
    }
    for (let j = 0; j < dim; j++) {
      for (let k = 0; k < K; k++) {
        let g = lambda * W[j * K + k]!
        for (let i = 0; i < n; i++) g += X[i * dim + j]! * G[i * K + k]!
        W[j * K + k]! -= rate * g
      }
    }
    for (let k = 0; k < K; k++) {
      let g = 0
      for (let i = 0; i < n; i++) g += G[i * K + k]!
      b[k]! -= rate * g
    }
  }
  return { classes, W, b, mu, sd, dim }
}

export const predictSignHead = (head: SignHead, emb: number[]): SignRanked[] => {
  const K = head.classes.length
  const z = new Float64Array(K)
  for (let k = 0; k < K; k++) {
    let v = head.b[k]!
    for (let j = 0; j < head.dim; j++) v += ((emb[j]! - head.mu[j]!) / head.sd[j]!) * head.W[j * K + k]!
    z[k] = v
  }
  const max = Math.max(...z)
  const e = Array.from(z, (v) => Math.exp(v - max))
  const sum = e.reduce((a, x) => a + x, 0)
  return head.classes
    .map((label, k) => ({ label, score: e[k]! / sum, best: e[k]! / sum }))
    .sort((a, b) => b.score - a.score)
}

/** The answer, or none: a kind counts only at or above `minProb`. */
export const decideSign = (ranked: SignRanked[], t: SignThresholds): SignVerdict => {
  const top = ranked[0]
  const margin = top ? top.score - (ranked[1]?.score ?? 0) : 0
  return { ranked, label: top && top.score >= t.minProb ? top.label : null, score: top?.score ?? 0, margin }
}

export interface SignTestRow { photoId: string; truth: string; ranked: SignRanked[] }
export const summarizeSignTest = (rows: SignTestRow[], t: SignThresholds) => {
  const decided = rows.map((r) => ({ ...r, verdict: decideSign(r.ranked, t) }))
  const right = decided.filter((r) => r.verdict.label === r.truth).length
  const wrong = decided.filter((r) => r.verdict.label && r.verdict.label !== r.truth)
  const abstain = decided.filter((r) => !r.verdict.label).length
  return { total: rows.length, right, wrong, abstain, decided }
}

export const useSignRecognizer = () => {
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref<string | null>(null)
  const photos = ref<SignPhoto[]>([])
  const examples = ref<SignExample[]>([])
  const busy = ref<string | null>(null)

  const refresh = async () => {
    photos.value = await all<SignPhoto>('photos')
    examples.value = await all<SignExample>('examples')
  }

  const ready = async () => {
    if (status.value === 'ready') return loadModel()
    status.value = 'loading'
    try {
      const m = await loadModel()
      status.value = 'ready'
      return m
    } catch (e: any) {
      status.value = 'error'
      error.value = e?.message ?? String(e)
      throw e
    }
  }

  /** Learn one photo as an example of `label`. */
  const teach = async (blob: Blob, meta: { city: string; zone: string; source?: string }) => {
    const model = await ready()
    const bmp = await bitmapOf(blob)
    const label = `${meta.city} · ${meta.zone}`
    const photoId = crypto.randomUUID()
    const rows: SignExample[] = []
    for (const [i, v] of REF_VIEWS.entries()) {
      rows.push({ id: `${photoId}:r${i}`, photoId, label, kind: 'ref', emb: await embedView(model, bmp, v) })
    }
    const q = mean(await Promise.all(QUERY_VIEWS.map((v) => embedView(model, bmp, v))))
    rows.push({ id: `${photoId}:q`, photoId, label, kind: 'query', emb: q })
    await put('examples', rows)
    await put('photos', [{ photoId, label, city: meta.city, zone: meta.zone, thumb: thumbOf(bmp), source: meta.source ?? 'upload' }])
    bmp.close()
  }

  /** Embed a photo the way a scan would, without storing it. */
  const embedQuery = async (blob: Blob) => {
    const model = await ready()
    const bmp = await bitmapOf(blob)
    const q = mean(await Promise.all(QUERY_VIEWS.map((v) => embedView(model, bmp, v))))
    bmp.close()
    return q
  }

  // The classifier over every example, retrained when the examples change.
  let head: SignHead | null = null
  let headFor = -1
  const currentHead = () => {
    const refs = examples.value.filter((e) => e.kind === 'ref')
    if (headFor !== refs.length) {
      head = trainSignHead(refs)
      headFor = refs.length
    }
    return head
  }
  const recognize = (emb: number[]): SignRanked[] => {
    const h = currentHead()
    return h ? predictSignHead(h, emb) : []
  }

  /**
   * Each stored photo recognised by a classifier trained on all the OTHER photos
   * (leave-one-out), so the score is what a new photo would get. One training per
   * photo; it yields between them so the page keeps drawing.
   */
  const test = async (onProgress?: (done: number, total: number) => void): Promise<SignTestRow[]> => {
    const queries = examples.value.filter((e) => e.kind === 'query')
    const rows: SignTestRow[] = []
    for (const [i, q] of queries.entries()) {
      const h = trainSignHead(examples.value.filter((e) => e.kind === 'ref' && e.photoId !== q.photoId))
      rows.push({ photoId: q.photoId, truth: q.label, ranked: h ? predictSignHead(h, q.emb) : [] })
      onProgress?.(i + 1, queries.length)
      await new Promise((r) => setTimeout(r, 0))
    }
    return rows
  }

  const remove = async (photoId: string) => {
    await removePhotoRows(photoId)
    await refresh()
  }
  const reset = async () => {
    await clearStores()
    await refresh()
  }
  const exportJson = () =>
    JSON.stringify({ version: 1, model: 'mobilenet_v2_100_224/panel', photos: photos.value, examples: examples.value })
  const importJson = async (text: string) => {
    const data = JSON.parse(text)
    if (data?.model !== 'mobilenet_v2_100_224/panel') throw new Error('Drugi model — ovi primeri se ne mogu porediti.')
    await put('photos', data.photos ?? [])
    await put('examples', data.examples ?? [])
    await refresh()
  }

  return { status, error, photos, examples, busy, refresh, ready, teach, embedQuery, recognize, test, remove, reset, exportJson, importJson }
}
