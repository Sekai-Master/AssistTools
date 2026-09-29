/**
 * ボーダー予測モデルの純粋関数群。
 * Worker（予測）と解析ジョブ（学習・評価）の両方がこのファイルだけを使う。経路は1本に保つ。
 *
 * モデル: 終値予測 = 現在の実測ボーダー ÷ シェア表(期間, 順位帯, 経過率)
 * 誤差の定義: err = 予測 ÷ 実測終値 − 1（マイナス＝低く外した）
 */

export const RANKS = [50, 100, 200, 500, 1000, 2000] as const
export type Rank = (typeof RANKS)[number]

export const GRID_STEP = 0.02
/** 経過率の格子 0.00〜1.00（51点） */
export const GRID: readonly number[] = Array.from({ length: 51 }, (_, i) => Math.round(i * GRID_STEP * 100) / 100)

/** これより長いサンプルの空白をまたぐ補間は信用しない（216 の 23h 欠測で実害が出た） */
export const MAX_GAP_MS = 2 * 3_600_000

/**
 * 評価に使う経過率の範囲。序盤（開始6時間＝150h の 0.04 あたり）から誤差を測り、
 * 序盤は「目安」として幅つきで出す（2026-09-30 Nori 提案。6h 時点で |誤差| 中央 8〜12%）
 */
export const EVAL_FROM = 0.02
export const EVAL_TO = 0.98
/** 候補モデルの採点に使う経過率の範囲（意思決定に使う帯） */
export const SCORE_FROM = 0.4
export const SCORE_TO = 0.96

export type Sample = readonly [ts: number, score: number]

export interface EventMeta {
  id: number
  name: string
  eventType: string
  unit: string
  startAt: number
  aggregateAt: number
}

export interface Shape {
  eventId: number
  rank: number
  final: number
  /** GRID の各点での 累積 ÷ 終値。欠測は null */
  share: (number | null)[]
}

export function eventEndMs(e: Pick<EventMeta, 'aggregateAt'>): number {
  return e.aggregateAt + 60_000
}

export function durationHours(e: Pick<EventMeta, 'startAt' | 'aggregateAt'>): number {
  return Math.round((e.aggregateAt - e.startAt) / 3_600_000)
}

export function progressAt(e: Pick<EventMeta, 'startAt' | 'aggregateAt'>, t: number): number {
  return (t - e.startAt) / (eventEndMs(e) - e.startAt)
}

/** 時刻 t の値を線形補間する。開始時刻に 0 の仮想点を置く。空白が長すぎれば null */
export function valueAt(series: readonly Sample[], startAt: number, t: number): number | null {
  if (t <= startAt) return 0
  let prevTs = startAt
  let prevVal = 0
  for (const [ts, v] of series) {
    if (ts < startAt) continue
    if (ts >= t) {
      if (ts - prevTs > MAX_GAP_MS) return null
      if (ts === prevTs) return v
      return prevVal + ((v - prevVal) * (t - prevTs)) / (ts - prevTs)
    }
    prevTs = ts
    prevVal = v
  }
  return null
}

/** 終了済みイベントの系列から形（シェア列）を作る。確定前・データ不足なら null */
export function buildShape(e: EventMeta, rank: number, series: readonly Sample[]): Shape | null {
  if (series.length < 10) return null
  const last = series[series.length - 1]
  if (last[0] < e.aggregateAt) return null
  const final = last[1]
  if (!(final > 0)) return null
  const span = eventEndMs(e) - e.startAt
  const share = GRID.map((p) => {
    const v = valueAt(series, e.startAt, e.startAt + p * span)
    return v == null ? null : v / final
  })
  return { eventId: e.id, rank, final, share }
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** 線形補間の分位点（q は 0〜1） */
export function quantile(xs: readonly number[], q: number): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** 格子上の値列を経過率 p で線形補間する */
export function interpGrid(table: readonly (number | null)[], p: number): number | null {
  if (p <= 0) return table[0]
  if (p >= 1) return table[table.length - 1]
  const x = p / GRID_STEP
  const i = Math.floor(x)
  const a = table[i]
  const b = table[i + 1]
  if (a == null || b == null) return null
  return a + (b - a) * (x - i)
}

// ---------------------------------------------------------------------------
// 候補モデル（プールの切り方）
// ---------------------------------------------------------------------------

export const CANDIDATES = ['same_all', 'same_recent8', 'all_recent12', 'same_all_debias5'] as const
export type CandidateId = (typeof CANDIDATES)[number]

export const CANDIDATE_LABEL: Record<CandidateId, string> = {
  same_all: '同じ期間の全履歴（v0 と同じ）',
  same_recent8: '同じ期間の直近8件',
  all_recent12: '期間を問わず直近12件',
  same_all_debias5: '同じ期間の全履歴＋直近5件の偏りを補正',
}

export interface HistoryEvent {
  meta: EventMeta
  shapes: ReadonlyMap<number, Shape>
}

const MIN_POOL = 3

function medianTable(pool: readonly Shape[]): (number | null)[] {
  return GRID.map((_, i) => {
    const xs: number[] = []
    for (const s of pool) {
      const v = s.share[i]
      if (v != null && v > 0) xs.push(v)
    }
    return xs.length >= MIN_POOL ? median(xs) : null
  })
}

function basePool(
  cand: CandidateId,
  duration: number,
  history: readonly HistoryEvent[],
  rank: number,
): Shape[] {
  const all = history.filter((h) => h.shapes.has(rank))
  const same = all.filter((h) => durationHours(h.meta) === duration)
  const sameOrAll = same.length >= MIN_POOL ? same : all
  let picked: readonly HistoryEvent[]
  switch (cand) {
    case 'same_all':
    case 'same_all_debias5':
      picked = sameOrAll
      break
    case 'same_recent8':
      picked = sameOrAll.slice(-8)
      break
    case 'all_recent12':
      picked = all.slice(-12)
      break
  }
  return picked.map((h) => h.shapes.get(rank) as Shape)
}

/** 過去の誤差列（格子ごと）から偏り（中央値）を出す */
export function biasFromErrors(recent: readonly (readonly (number | null)[])[]): (number | null)[] {
  return GRID.map((_, i) => {
    const xs = recent.map((r) => r[i]).filter((v): v is number => v != null)
    return xs.length >= MIN_POOL ? median(xs) : null
  })
}

/**
 * 候補 cand のシェア表を作る。history は対象イベントの開始前に終わったものだけ（リーク防止は呼び出し側）。
 * debias の場合は same_all の過去誤差（直近5件）を渡す。
 */
export function candidateTable(
  cand: CandidateId,
  duration: number,
  history: readonly HistoryEvent[],
  rank: number,
  sameAllRecentErrors: readonly (readonly (number | null)[])[] = [],
): (number | null)[] {
  const table = medianTable(basePool(cand, duration, history, rank))
  if (cand !== 'same_all_debias5') return table
  const bias = biasFromErrors(sameAllRecentErrors.slice(-5))
  return table.map((v, i) => (v == null ? null : v * (1 + (bias[i] ?? 0))))
}

/** 対象の形に対する誤差列。err = share_target / table − 1 */
export function errorsAgainst(target: Shape, table: readonly (number | null)[]): (number | null)[] {
  return GRID.map((p, i) => {
    if (p < EVAL_FROM || p > EVAL_TO) return null
    const s = target.share[i]
    const t = table[i]
    if (s == null || t == null || t <= 0) return null
    return s / t - 1
  })
}

/** 1イベントの採点: 意思決定帯の |誤差| の中央値 */
export function eventScore(errs: readonly (number | null)[]): number | null {
  const xs: number[] = []
  GRID.forEach((p, i) => {
    const e = errs[i]
    if (p >= SCORE_FROM && p <= SCORE_TO && e != null) xs.push(Math.abs(e))
  })
  return xs.length >= 5 ? median(xs) : null
}

// ---------------------------------------------------------------------------
// 前向き検証（walk-forward）と、王者/挑戦者の入れ替え
// ---------------------------------------------------------------------------

export const ROLLING_WINDOW = 8
export const PROMOTE_MARGIN = 0.95
export const BAND_WINDOW = 20
export const BAND_Q_LO = 0.1
export const BAND_Q_HI = 0.9
const BAND_HALF_SPAN = 0.04

export interface EventEval {
  eventId: number
  duration: number
  /** 候補ごとの誤差列 */
  errors: Record<CandidateId, (number | null)[]>
  scores: Record<CandidateId, number | null>
  /** その時点で王者だった候補（本番ならこれが出ていた） */
  champion: CandidateId
}

export interface RankWalk {
  rank: number
  evals: EventEval[]
  /** 次のイベントに使う王者 */
  champion: CandidateId
  rolling: Record<CandidateId, number | null>
}

function rollingMean(evals: readonly EventEval[], cand: CandidateId): number | null {
  const xs = evals
    .slice(-ROLLING_WINDOW)
    .map((e) => e.scores[cand])
    .filter((v): v is number => v != null)
  if (xs.length < Math.min(ROLLING_WINDOW, 5)) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function pickChampion(current: CandidateId, evals: readonly EventEval[]): CandidateId {
  const rolling = Object.fromEntries(CANDIDATES.map((c) => [c, rollingMean(evals, c)])) as Record<CandidateId, number | null>
  const cur = rolling[current]
  if (cur == null) return current
  let best: CandidateId = current
  for (const c of CANDIDATES) {
    const v = rolling[c]
    if (v != null && v < (rolling[best] ?? Infinity)) best = c
  }
  return best !== current && (rolling[best] as number) < cur * PROMOTE_MARGIN ? best : current
}

/**
 * 順位帯ごとに、時系列順の前向き検証を回す。
 * events は開始時刻順。各対象について「対象の開始前に終わったイベント」だけで表を作る。
 */
export function walkForward(events: readonly HistoryEvent[], rank: number): RankWalk {
  const sorted = [...events].sort((a, b) => a.meta.startAt - b.meta.startAt)
  const evals: EventEval[] = []
  let champion: CandidateId = 'same_all'
  for (const target of sorted) {
    const shape = target.shapes.get(rank)
    if (!shape) continue
    const history = sorted.filter((h) => h.meta.aggregateAt < target.meta.startAt)
    if (history.filter((h) => h.shapes.has(rank)).length < MIN_POOL) continue
    const duration = durationHours(target.meta)
    const sameAllErrs = evals.map((e) => e.errors.same_all)
    const errors = {} as Record<CandidateId, (number | null)[]>
    const scores = {} as Record<CandidateId, number | null>
    for (const c of CANDIDATES) {
      const table = candidateTable(c, duration, history, rank, sameAllErrs)
      errors[c] = errorsAgainst(shape, table)
      scores[c] = eventScore(errors[c])
    }
    evals.push({ eventId: target.meta.id, duration, errors, scores, champion })
    champion = pickChampion(champion, evals)
  }
  const rolling = Object.fromEntries(CANDIDATES.map((c) => [c, rollingMean(evals, c)])) as Record<CandidateId, number | null>
  return { rank, evals, champion, rolling }
}

/** 帯を作るのに要る誤差の標本数の下限 */
export const BAND_MIN_SAMPLES = 15

/** 候補 cand の直近 BAND_WINDOW 件について、経過率 p の近く（±BAND_HALF_SPAN）の誤差を集める */
export function bandSamplesAt(evals: readonly EventEval[], cand: CandidateId, p: number): number[] {
  const xs: number[] = []
  for (const ev of evals.slice(-BAND_WINDOW)) {
    GRID.forEach((q, j) => {
      const e = ev.errors[cand][j]
      if (e != null && Math.abs(q - p) <= BAND_HALF_SPAN + 1e-9) xs.push(e)
    })
  }
  return xs
}

/**
 * 候補 cand の直近 BAND_WINDOW 件の誤差から、格子ごとの非対称な帯（分位点）を作る。
 * tail は片側の裾（0.1 なら 10〜90パーセンタイル）。
 */
export function bandsFrom(
  evals: readonly EventEval[],
  cand: CandidateId,
  tail: number = BAND_Q_LO,
): { lo: (number | null)[]; hi: (number | null)[]; n: number[] } {
  const lo: (number | null)[] = []
  const hi: (number | null)[] = []
  const n: number[] = []
  GRID.forEach((p) => {
    const xs = bandSamplesAt(evals, cand, p)
    n.push(xs.length)
    if (xs.length < BAND_MIN_SAMPLES) {
      lo.push(null)
      hi.push(null)
    } else {
      lo.push(quantile(xs, tail))
      hi.push(quantile(xs, 1 - tail))
    }
  })
  return { lo, hi, n }
}

// ---------------------------------------------------------------------------
// 予測（Worker が使う）
// ---------------------------------------------------------------------------

export interface RankModel {
  candidate: CandidateId
  /** これより前の経過率では表に出さない（予測自体は記録する） */
  minProgress: number
  /** 期間（時間）ごとのシェア表。"all" は該当期間が無いときのフォールバック */
  tables: Record<string, (number | null)[]>
  band: { lo: (number | null)[]; hi: (number | null)[] }
}

export interface Model {
  version: string
  createdAt: string
  algorithm: 'share-median-v1'
  grid: number[]
  ranks: Record<string, RankModel>
  /**
   * 標本が3件以上ある期間（時間）。これより長い／短い期間のイベントは「過去に無い長さ」として、
   * いちばん近い端の期間の表（tables.far_long / far_short）で当て、帯を FAR_BAND_FACTOR 倍に広げる。
   * 古い版のモデルには無い（そのときは tables.all）
   */
  knownDurations?: number[]
}

/**
 * 過去に無い長さのイベントで帯を広げる倍率。
 * 222h を「見たことのない長さ」として当てると、全マラソンの表では中盤に +6〜8% 高く外した（2026-09-30 実測・n=5）。
 * いちばん近い長さを使うと偏りは少し減るが、長さの違いそのものの読めなさは帯に乗せる
 */
export const FAR_BAND_FACTOR = 1.5

export interface TableChoice {
  table: (number | null)[]
  /** 過去に無い長さで、近い端の期間から借りたとき、その期間 */
  extrapolatedFrom: number | null
}

export function chooseTable(model: Model, rm: RankModel, duration: number): TableChoice | null {
  const exact = rm.tables[String(duration)]
  if (exact) return { table: exact, extrapolatedFrom: null }
  const known = model.knownDurations ?? []
  if (known.length > 0) {
    const max = Math.max(...known)
    const min = Math.min(...known)
    if (duration > max && rm.tables.far_long) return { table: rm.tables.far_long, extrapolatedFrom: max }
    if (duration < min && rm.tables.far_short) return { table: rm.tables.far_short, extrapolatedFrom: min }
  }
  return rm.tables.all ? { table: rm.tables.all, extrapolatedFrom: null } : null
}

/**
 * 確度。帯の幅（上側誤差 − 下側誤差）で決める。数字の読み方を1語で伝えるためのもの。
 *   high  … 幅 10ポイント以内（おおむね ±5%）
 *   mid   … 幅 30ポイント以内（おおむね ±15%）
 *   rough … それより広い（序盤の「目安」）
 * MAX_ROUGH_WIDTH より広い帯は、幅として意味を持たないので表に出さない。
 */
export type Confidence = 'high' | 'mid' | 'rough'
export const CONFIDENCE_HIGH_WIDTH = 0.1
export const CONFIDENCE_MID_WIDTH = 0.3
export const MAX_ROUGH_WIDTH = 0.8

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: '高', mid: '中', rough: '目安' }

export function confidenceOf(lo: number | null, hi: number | null): Confidence | null {
  if (lo == null || hi == null) return null
  const width = hi - lo
  if (!(width >= 0) || width > MAX_ROUGH_WIDTH) return null
  if (width <= CONFIDENCE_HIGH_WIDTH) return 'high'
  if (width <= CONFIDENCE_MID_WIDTH) return 'mid'
  return 'rough'
}

export interface Prediction {
  rank: number
  progress: number
  current: number
  share: number
  predicted: number
  /** 帯の下限・上限（終値の予測範囲） */
  low: number | null
  high: number | null
  /** 帯の幅から決めた確度。帯が無い・広すぎるときは null */
  confidence: Confidence | null
  /** 過去に無い長さで、近い端の期間（時間）の表を借りたとき、その期間。帯は広げてある */
  extrapolatedFrom: number | null
  visible: boolean
}

export function predict(model: Model, meta: EventMeta, rank: number, current: number, t: number): Prediction | null {
  const rm = model.ranks[String(rank)]
  if (!rm || !(current > 0)) return null
  const p = progressAt(meta, t)
  if (!(p > 0) || p > 1.001) return null
  const choice = chooseTable(model, rm, durationHours(meta))
  if (!choice) return null
  const share = interpGrid(choice.table, Math.min(p, 1))
  if (share == null || share <= 0) return null
  const predicted = current / share
  const widen = choice.extrapolatedFrom == null ? 1 : FAR_BAND_FACTOR
  const loRaw = interpGrid(rm.band.lo, Math.min(p, 1))
  const hiRaw = interpGrid(rm.band.hi, Math.min(p, 1))
  const lo = loRaw == null ? null : loRaw * widen
  const hi = hiRaw == null ? null : hiRaw * widen
  // err = pred/final − 1 → final = pred/(1+err)。上側の誤差が下限、下側の誤差が上限になる
  const low = hi == null ? null : predicted / (1 + hi)
  const high = lo == null ? null : predicted / (1 + lo)
  const confidence = confidenceOf(lo, hi)
  return {
    rank,
    progress: p,
    current,
    share,
    predicted,
    low: low == null ? null : Math.max(low, current),
    high,
    confidence,
    extrapolatedFrom: choice.extrapolatedFrom,
    // 帯が無い・広すぎる予測は、確度を名乗れないので出さない（記録はする）
    visible: p >= rm.minProgress && confidence != null,
  }
}
