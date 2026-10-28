/**
 * 率モデル: 期間ごとにシェア表を作るのをやめて、全マラソンの「1時間あたりの伸び率」を
 * 経過時間・残り時間・JST の時刻の関数として当てはめる。どんな期間・開始時刻の表も作れるので、
 * 過去に数件しかない期間（102h など）でも他の期間の履歴を借りて表が引ける。
 *
 * 各回 k の各格子区間 j について、1時間あたりの終値比 d/Δh の対数 y を
 *   y = alpha_k + f(経過h) + g(残りh) + h(時刻) + 誤差
 * で説明する。alpha_k（回ごとの切片）は回の規模を吸うだけで、表を作るときは打ち消すので捨てる。
 *   f, g … log1p(時間) の結び目に置いた折れ線（ヒンジ）基底
 *   h     … 時刻の区分定数（円環）
 */
import { GRID, eventEndMs, type EventMeta, type HistoryEvent } from './model.ts'

export interface RateOptions {
  /** 切片以外の全係数にかける小さな尻押さえ（既定 1.0）。f/g/h の定数分の不定を潰す */
  ridge?: number
  /** 滑らかさ罰則の強さ（既定 5.0）。f, g は2階差分、h は円環の1階差分 */
  smooth?: number
  /** 時刻効果のビン数（既定 8 = 3時間刻み） */
  clockBins?: number
}

export interface RateFit {
  rank: number
  options: Required<RateOptions>
  /** 結び目（log1p 時間）。f と g で共通 */
  knots: readonly number[]
  /** f(経過h) の係数（結び目ごと） */
  beta: readonly number[]
  /** g(残りh) の係数（結び目ごと） */
  gamma: readonly number[]
  /** h(時刻) の係数（ビンごと。0時〜 24/clockBins 時間刻み） */
  clock: readonly number[]
  /** 回ごとの切片（診断用。表の生成には使わない） */
  alphas: readonly { eventId: number; alpha: number }[]
  nEvents: number
  nRows: number
  /** 当てはめ残差の二乗平均平方根（y = log 比率の単位） */
  sigma: number
}

const DEFAULTS: Required<RateOptions> = { ridge: 1.0, smooth: 5.0, clockBins: 8 }

/** 経過・残り時間の結び目（時間）。長い回ほど粗くなるよう倍々に置く */
const KNOT_HOURS = [0, 2, 4, 8, 16, 32, 64, 128, 256] as const
const KNOTS: readonly number[] = KNOT_HOURS.map((h) => Math.log1p(h))
const K = KNOTS.length

/** 当てはめに要る最低の回数 */
const MIN_EVENTS = 3
/** 表を積分する刻み幅（時間） */
const STEP_H = 0.05

const HOUR_MS = 3_600_000

const mod = (x: number, m: number) => ((x % m) + m) % m

/** 開始時刻の JST 時刻（小数の時） */
function jstClock(startAt: number): number {
  return mod(startAt / HOUR_MS + 9, 24)
}

/** 折れ線基底の位置。x（log1p 時間）が入る区間の左の結び目 i と、右の基底への重み t（左は 1-t）。範囲外は端に張り付ける */
function hatPos(x: number): [number, number] {
  if (x <= KNOTS[0]) return [0, 0]
  if (x >= KNOTS[K - 1]) return [K - 2, 1]
  let i = 0
  while (x > KNOTS[i + 1]) i++
  return [i, (x - KNOTS[i]) / (KNOTS[i + 1] - KNOTS[i])]
}

function evalHat(coef: readonly number[], hours: number): number {
  const [i, t] = hatPos(Math.log1p(Math.max(0, hours)))
  return coef[i] * (1 - t) + coef[i + 1] * t
}

function clockBin(c: number, bins: number): number {
  return Math.min(bins - 1, Math.floor(c / (24 / bins)))
}

/** 対称正定値の連立方程式を Cholesky で解く（A は破壊される）。正定値でなければ null */
function solveSPD(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j]
    for (let k = 0; k < j; k++) d -= A[j * n + k] ** 2
    if (!(d > 1e-12)) return null
    const ljj = Math.sqrt(d)
    A[j * n + j] = ljj
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j]
      for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k]
      A[i * n + j] = s / ljj
    }
  }
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let k = 0; k < i; k++) s -= A[i * n + k] * x[k]
    x[i] = s / A[i * n + i]
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]
    for (let k = i + 1; k < n; k++) s -= A[k * n + i] * x[k]
    x[i] = s / A[i * n + i]
  }
  return x
}

/** 罰則 w * (Σ coefs[a] * θ[cols[a]])² を A に足す */
function addPenalty(A: Float64Array, n: number, cols: readonly number[], coefs: readonly number[], w: number): void {
  for (let a = 0; a < cols.length; a++) {
    for (let b = 0; b < cols.length; b++) A[cols[a] * n + cols[b]] += w * coefs[a] * coefs[b]
  }
}

/** 1区間ぶんの応答と、各項の基底位置 */
interface IntervalRow {
  y: number
  /** f 側の基底位置と重み、g 側、時刻ビン */
  bi: number
  bt: number
  gi: number
  gt: number
  cb: number
}

interface Row {
  /** 設計行列の非ゼロ（列番号, 値） */
  cols: number[]
  vals: number[]
  y: number
}

export function fitRate(history: readonly HistoryEvent[], rank: number, opts: RateOptions = {}): RateFit | null {
  const options: Required<RateOptions> = {
    ridge: opts.ridge ?? DEFAULTS.ridge,
    smooth: opts.smooth ?? DEFAULTS.smooth,
    clockBins: opts.clockBins ?? DEFAULTS.clockBins,
  }
  const B = options.clockBins
  if (!Number.isInteger(B) || B < 1) return null

  // 1. 区間ごとの行を作る。行を1本も出さない回は切片の列を持たない（持つと特異になる）
  const perEvent: { eventId: number; rows: IntervalRow[] }[] = []
  for (const h of history) {
    const shape = h.shapes.get(rank)
    if (!shape) continue
    const spanH = (eventEndMs(h.meta) - h.meta.startAt) / HOUR_MS
    const c0 = jstClock(h.meta.startAt)
    const rows: IntervalRow[] = []
    for (let j = 0; j < GRID.length - 1; j++) {
      const s0 = shape.share[j]
      const s1 = shape.share[j + 1]
      if (s0 == null || s1 == null) continue
      const d = s1 - s0
      if (!(d > 0)) continue
      const e0 = GRID[j] * spanH
      const e1 = GRID[j + 1] * spanH
      const m = (e0 + e1) / 2
      const [bi, bt] = hatPos(Math.log1p(m))
      const [gi, gt] = hatPos(Math.log1p(spanH - m))
      rows.push({ y: Math.log(d / (e1 - e0)), bi, bt, gi, gt, cb: clockBin(mod(c0 + m, 24), B) })
    }
    if (rows.length > 0) perEvent.push({ eventId: h.meta.id, rows })
  }
  const nEv = perEvent.length
  if (nEv < MIN_EVENTS) return null

  // 列の並び: [切片 × nEv][beta × K][gamma × K][clock × B]
  const offBeta = nEv
  const offGamma = nEv + K
  const offClock = nEv + 2 * K
  const n = offClock + B

  const rows: Row[] = []
  perEvent.forEach((ev, k) => {
    for (const r of ev.rows) {
      rows.push({
        cols: [k, offBeta + r.bi, offBeta + r.bi + 1, offGamma + r.gi, offGamma + r.gi + 1, offClock + r.cb],
        vals: [1, 1 - r.bt, r.bt, 1 - r.gt, r.gt, 1],
        y: r.y,
      })
    }
  })

  // 2. 正規方程式 (XᵀX + P) θ = Xᵀy
  const A = new Float64Array(n * n)
  const b = new Float64Array(n)
  for (const r of rows) {
    for (let a = 0; a < r.cols.length; a++) {
      b[r.cols[a]] += r.vals[a] * r.y
      for (let c = 0; c < r.cols.length; c++) A[r.cols[a] * n + r.cols[c]] += r.vals[a] * r.vals[c]
    }
  }
  for (let j = nEv; j < n; j++) A[j * n + j] += options.ridge
  for (const off of [offBeta, offGamma]) {
    for (let i = 0; i + 2 < K; i++) addPenalty(A, n, [off + i, off + i + 1, off + i + 2], [1, -2, 1], options.smooth)
  }
  if (B >= 2) {
    for (let c = 0; c < B; c++) addPenalty(A, n, [offClock + c, offClock + ((c + 1) % B)], [1, -1], options.smooth)
  }

  const theta = solveSPD(A, b, n)
  if (!theta) return null

  // 3. 残差
  let rss = 0
  for (const r of rows) {
    let pred = 0
    for (let a = 0; a < r.cols.length; a++) pred += r.vals[a] * theta[r.cols[a]]
    rss += (r.y - pred) ** 2
  }

  return {
    rank,
    options,
    knots: KNOTS,
    beta: Array.from(theta.subarray(offBeta, offBeta + K)),
    gamma: Array.from(theta.subarray(offGamma, offGamma + K)),
    clock: Array.from(theta.subarray(offClock, offClock + B)),
    alphas: perEvent.map((ev, k) => ({ eventId: ev.eventId, alpha: theta[k] })),
    nEvents: nEv,
    nRows: rows.length,
    sigma: Math.sqrt(rss / rows.length),
  }
}

/** f(経過h)・g(残りh)・h(時刻) の寄与（対数）。診断表示用 */
export function rateComponents(fit: RateFit, elapsedH: number, remainingH: number, clockH: number): { f: number; g: number; h: number } {
  return {
    f: evalHat(fit.beta, elapsedH),
    g: evalHat(fit.gamma, remainingH),
    h: fit.clock[clockBin(mod(clockH, 24), fit.clock.length)],
  }
}

/**
 * 指定の日程のシェア表（GRID の51点。0 → 1 の単調増加）を作る。
 * base(t) = exp(f(t) + g(span − t) + h(c0 + t)) を細かい刻みの中点則で積分し、全体で割る。
 */
export function rateShareTable(fit: RateFit, meta: Pick<EventMeta, 'startAt' | 'aggregateAt'>): (number | null)[] {
  const spanH = (eventEndMs(meta) - meta.startAt) / HOUR_MS
  const c0 = jstClock(meta.startAt)
  const steps = Math.max(1, Math.ceil(spanH / STEP_H))
  const dt = spanH / steps

  // exp のあふれを避けるため、対数のうち最大を引いてから指数に戻す（全体で割るので結果は変わらない）
  const logs = new Float64Array(steps)
  let top = -Infinity
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt
    const c = rateComponents(fit, t, spanH - t, c0 + t)
    logs[i] = c.f + c.g + c.h
    if (logs[i] > top) top = logs[i]
  }
  const cum = new Float64Array(steps + 1)
  for (let i = 0; i < steps; i++) cum[i + 1] = cum[i] + Math.exp(logs[i] - top)
  const total = cum[steps]

  return GRID.map((p, i) => {
    if (i === 0) return 0
    if (i === GRID.length - 1) return 1
    const x = (p * spanH) / dt
    const k = Math.min(steps - 1, Math.floor(x))
    return (cum[k] + (cum[k + 1] - cum[k]) * (x - k)) / total
  })
}
