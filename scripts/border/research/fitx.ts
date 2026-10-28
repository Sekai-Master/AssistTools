/**
 * 検証用の学習（fit.ts の fitModel を、改善案を切り替えられる形に写したもの）。
 *
 * PROD の設定では fitModel と同じ表・帯を作る（parity.ts で確かめる）。改善案はどれも「表と帯の焼き方」だけを変え、
 * Worker の predict() はそのまま使えるようにしてある（本番に入れるときに Worker のデプロイが要らない）。
 *
 *   selection … champion: 4候補から王者を1つ選ぶ（本番） / ensemble: 4候補の表の幾何平均（選ばない）
 *   early     … switch: 切り替え点より前を blend に差し替え（本番） / ramp: 重みをなだらかに 1→0 / none: 差し替えない
 *   band      … pooled: 経過 ±0.04 の5点をそのまま標本に（本番） / perEvent: 1回につき1標本（5点の平均）
 *   bandWindow… 帯に使う直近の回の数（本番 20）
 *   tailMode  … zone: 裾を序盤・中盤以降の2つで選ぶ（本番） / bucket: 経過率の6区間ごとに選び、区間の中心どうしを線形補間
 *   rate      … none（本番） / mix: どの表も率モデル（rate.ts。経過・残り・時刻）の表と幾何平均する。
 *               前向き検証の誤差も混ぜた表で作り直すので、王者・切り替え点・帯もすべて混ぜた表に合わせて選ばれる
 */
import {
  CANDIDATES,
  GRID,
  MAX_ROUGH_WIDTH,
  PROMOTE_MARGIN,
  RANKS,
  SCORE_TO,
  THIN_WEIGHT,
  candidateTable,
  durationHours,
  median,
  quantile,
  thinKey,
  walkForward,
  type CandidateId,
  type EventEval,
  type EventMeta,
  type HistoryEvent,
  type Model,
  type RankModel,
  type Shape,
  type ThinDuration,
} from '../../../workers/border/src/model.ts'
import { fitRate, rateShareTable } from '../../../workers/border/src/rate.ts'
import {
  ALGORITHM,
  BAND_TAILS,
  BLEND_MIN_EVENTS,
  BLEND_WINDOW,
  CHECKPOINTS,
  EARLY_CHECKPOINTS,
  EARLY_UNTIL,
  MIN_VISIBLE_PROGRESS,
  TARGET_COVERAGE,
  blendErrors,
  blendTable,
  thinTable,
} from '../../../workers/border/src/fit.ts'

export type EarlyOpt = null | { kind: 'switch'; at: number } | { kind: 'ramp'; from: number; to: number }

export interface FitX {
  selection: 'champion' | 'ensemble'
  early: 'switch' | 'ramp' | 'none'
  band: 'pooled' | 'perEvent'
  bandWindow: number
  tailMode: 'zone' | 'bucket'
  /** 裾の候補（片側）。本番は BAND_TAILS */
  tails: readonly number[]
  rate?: 'none' | 'mix'
  /** 表を焼いたあとに差し替える（rate モデルなど）。duration → 表 */
  tableHook?: (ctx: { history: readonly HistoryEvent[]; rank: number; tables: Record<string, (number | null)[]> }) => void
}

export const PROD: FitX = { selection: 'champion', early: 'switch', band: 'pooled', bandWindow: 20, tailMode: 'zone', tails: BAND_TAILS }

const ENS = 'ensemble' as CandidateId

// ---------------------------------------------------------------------------
// 率モデルとの混ぜ合わせ
// ---------------------------------------------------------------------------

const rateCache = new Map<string, (number | null)[] | null>()
/** history（target の開始前の回）で学習した率モデルの、target の長さ・開始時刻での表。同じ学習データは何度も使うので覚えておく */
function rateTableFor(history: readonly HistoryEvent[], rank: number, target: Pick<EventMeta, 'startAt' | 'aggregateAt'>): (number | null)[] | null {
  const key = `${rank}|${target.startAt}|${target.aggregateAt}|${history.map((h) => h.meta.id).join(',')}`
  if (!rateCache.has(key)) {
    const fit = fitRate(history, rank)
    rateCache.set(key, fit ? rateShareTable(fit, target) : null)
  }
  return rateCache.get(key) ?? null
}

/** 長さ d の回（15:00 開始・20:59:59 終了の標準の日程）。表は長さで引くので、開始時刻はいちばん多いものに合わせる */
function standardMeta(d: number): Pick<EventMeta, 'startAt' | 'aggregateAt'> {
  const startAt = Date.UTC(2026, 0, 1, 6) // 15:00 JST
  return { startAt, aggregateAt: startAt + d * 3_600_000 - 1000 }
}

const geo = (a: number | null, b: number | null) => (a != null && b != null && a > 0 && b > 0 ? Math.sqrt(a * b) : (a ?? b))
export const geoTables = (a: readonly (number | null)[], b: readonly (number | null)[] | null) => (b ? a.map((v, i) => geo(v, b[i])) : [...a])
/** 表 t と率モデルの表を幾何平均したときの誤差: s/√(t·r) − 1 = √((1+e)(1+er)) − 1 */
const geoErr = (e: number | null, er: number | null) => (e == null ? null : er == null || 1 + er <= 0 || 1 + e <= 0 ? e : Math.sqrt((1 + e) * (1 + er)) - 1)
const SWITCHES: EarlyOpt[] = [null, { kind: 'switch', at: 0.2 }, { kind: 'switch', at: 0.3 }, { kind: 'switch', at: 0.4 }]
const RAMPS: EarlyOpt[] = [
  null,
  { kind: 'ramp', from: 0.1, to: 0.3 },
  { kind: 'ramp', from: 0.2, to: 0.4 },
  { kind: 'ramp', from: 0.3, to: 0.5 },
  { kind: 'ramp', from: 0.2, to: 0.5 },
]

/** 経過率 p で blend に掛ける重み（1 = blend だけ、0 = 現行の表だけ） */
export function earlyWeight(opt: EarlyOpt, p: number): number {
  if (opt == null) return 0
  if (opt.kind === 'switch') return p < opt.at - 1e-9 ? 1 : 0
  if (p <= opt.from + 1e-9) return 1
  if (p >= opt.to - 1e-9) return 0
  return (opt.to - p) / (opt.to - opt.from)
}

/** 表どうしを重み w(p) で混ぜる（blend が無い点は base のまま） */
export function mixTables(base: readonly (number | null)[], blend: readonly (number | null)[], opt: EarlyOpt): (number | null)[] {
  return base.map((v, i) => {
    const w = earlyWeight(opt, GRID[i])
    const b = blend[i]
    if (w === 0 || b == null || v == null) return w === 1 && b != null ? b : v
    return w * b + (1 - w) * v
  })
}

/** 誤差列どうしを、表を w で混ぜたときの誤差に直す（t = s/(1+e) なので、混ぜた表の誤差は 1/(w/(1+eb) + (1−w)/(1+e0)) − 1） */
export function mixErrors(base: readonly (number | null)[], blend: readonly (number | null)[], opt: EarlyOpt): (number | null)[] {
  return base.map((e0, i) => {
    const w = earlyWeight(opt, GRID[i])
    const eb = blend[i]
    if (w === 0 || eb == null) return e0
    if (w === 1) return eb
    if (e0 == null) return null
    return 1 / (w / (1 + eb) + (1 - w) / (1 + e0)) - 1
  })
}

/** 4候補の誤差から、4候補の表の幾何平均で当てたときの誤差（s / geomean(t) − 1 = geomean(1+e) − 1） */
function ensembleErrors(errors: EventEval['errors']): (number | null)[] {
  return GRID.map((_, j) => {
    const xs = CANDIDATES.map((c) => errors[c][j]).filter((v): v is number => v != null && 1 + v > 0)
    if (xs.length < 2) return null
    return Math.exp(xs.reduce((a, v) => a + Math.log(1 + v), 0) / xs.length) - 1
  })
}

function ensembleTable(tables: readonly (readonly (number | null)[])[]): (number | null)[] {
  return GRID.map((_, j) => {
    const xs = tables.map((t) => t[j]).filter((v): v is number => v != null && v > 0)
    if (xs.length < 2) return null
    return Math.exp(xs.reduce((a, v) => a + Math.log(v), 0) / xs.length)
  })
}

// ---------------------------------------------------------------------------
// 帯
// ---------------------------------------------------------------------------

const HALF = 0.04
/** perEvent で帯を作るのに要る回の数の下限（pooled は本番と同じ 15 標本） */
const MIN_EVENTS_PER_EVENT = 10

function samplesAt(evals: readonly EventEval[], cand: CandidateId, p: number, o: FitX): number[] {
  const xs: number[] = []
  for (const ev of evals.slice(-o.bandWindow)) {
    const errs = ev.errors[cand]
    const win: number[] = []
    GRID.forEach((q, j) => {
      const e = errs[j]
      if (e != null && Math.abs(q - p) <= HALF + 1e-9) win.push(e)
    })
    if (o.band === 'pooled') xs.push(...win)
    else if (win.length > 0) xs.push(win.reduce((a, b) => a + b, 0) / win.length)
  }
  return xs
}

const enough = (xs: readonly number[], o: FitX) => xs.length >= (o.band === 'pooled' ? 15 : MIN_EVENTS_PER_EVENT)
const idx = (p: number) => Math.round(p / 0.02)

/** 裾 tail で、前向きに作った帯が当たった数（本番の coverageOf と同じ作り方。標本の作り方だけ o に従う） */
function coverage(evals: readonly EventEval[], tail: number, checkpoints: readonly number[], o: FitX): { covered: number; total: number } {
  let covered = 0
  let total = 0
  for (const p of checkpoints) {
    for (let i = 10; i < evals.length; i++) {
      const cand = evals[i].champion
      const xs = samplesAt(evals.slice(0, i), cand, p, o)
      const e = evals[i].errors[cand][idx(p)]
      if (e == null || !enough(xs, o)) continue
      total++
      if (e >= (quantile(xs, tail) as number) && e <= (quantile(xs, 1 - tail) as number)) covered++
    }
  }
  return { covered, total }
}

function chooseTailX(evals: readonly EventEval[], checkpoints: readonly number[], o: FitX): number {
  let last = o.tails[o.tails.length - 1]
  for (const tail of o.tails) {
    const c = coverage(evals, tail, checkpoints, o)
    last = tail
    if (c.total > 0 && c.covered / c.total >= TARGET_COVERAGE) return tail
  }
  return last
}

/** bucket モードの区間（代表の経過率と中心） */
export const BUCKETS: readonly { center: number; points: readonly number[] }[] = [
  { center: 0.08, points: [0.04, 0.08, 0.12] },
  { center: 0.22, points: [0.16, 0.2, 0.24, 0.28] },
  { center: 0.4, points: [0.32, 0.36, 0.4, 0.44, 0.48] },
  { center: 0.6, points: [0.52, 0.56, 0.6, 0.64, 0.68] },
  { center: 0.8, points: [0.72, 0.76, 0.8, 0.84, 0.88] },
  { center: 0.93, points: [0.9, 0.94, 0.96] },
]

/** 経過率ごとの裾。zone は 0.3 で段差、bucket は区間の中心どうしを線形補間 */
function tailCurve(served: readonly EventEval[], o: FitX): number[] {
  if (o.tailMode === 'zone') {
    const main = chooseTailX(served, CHECKPOINTS, o)
    const early = chooseTailX(served, EARLY_CHECKPOINTS, o)
    return GRID.map((p) => (p < EARLY_UNTIL - 1e-9 ? early : main))
  }
  const ts = BUCKETS.map((b) => chooseTailX(served, b.points, o))
  return GRID.map((p) => {
    if (p <= BUCKETS[0].center) return ts[0]
    for (let k = 1; k < BUCKETS.length; k++) {
      if (p <= BUCKETS[k].center) {
        const a = BUCKETS[k - 1].center
        const b = BUCKETS[k].center
        return ts[k - 1] + ((ts[k] - ts[k - 1]) * (p - a)) / (b - a)
      }
    }
    return ts[ts.length - 1]
  })
}

// ---------------------------------------------------------------------------
// 序盤の差し替えの選択（fit.ts の walkEarlyBlend を、切り替え点とランプの両方に広げたもの）
// ---------------------------------------------------------------------------

function earlyScore(errs: readonly (number | null)[], to: number): number | null {
  const xs: number[] = []
  GRID.forEach((p, i) => {
    const e = errs[i]
    if (p >= MIN_VISIBLE_PROGRESS - 1e-9 && p < to - 1e-9 && e != null) xs.push(Math.abs(e))
  })
  return xs.length >= 5 ? median(xs) : null
}

const optKey = (o: EarlyOpt) => (o == null ? 'none' : o.kind === 'switch' ? `s${o.at}` : `r${o.from}-${o.to}`)

function walkEarly(evals: readonly EventEval[], blend: readonly (number | null)[][], options: readonly EarlyOpt[]): { final: EarlyOpt; atTime: EarlyOpt[] } {
  const to = Math.max(...options.map((o) => (o == null ? 0 : o.kind === 'switch' ? o.at : o.to)), 0.4)
  let choice: EarlyOpt = null
  const atTime: EarlyOpt[] = []
  for (let i = 0; i < evals.length; i++) {
    atTime.push(choice)
    const from = Math.max(0, i + 1 - BLEND_WINDOW)
    const sums = options.map(() => 0)
    let scored = 0
    for (let k = from; k <= i; k++) {
      const cur = evals[k].errors[evals[k].champion]
      const sc = options.map((o) => earlyScore(mixErrors(cur, blend[k], o), to))
      if (sc.some((v) => v == null)) continue
      sc.forEach((v, n) => (sums[n] += v as number))
      scored++
    }
    if (scored < BLEND_MIN_EVENTS) continue
    const scoreOf = (o: EarlyOpt) => sums[options.findIndex((x) => optKey(x) === optKey(o))] / scored
    let best: EarlyOpt = choice
    for (const o of options) if (scoreOf(o) < scoreOf(best)) best = o
    if (optKey(best) !== optKey(choice) && scoreOf(best) < scoreOf(choice) * PROMOTE_MARGIN) choice = best
  }
  return { final: choice, atTime }
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

export interface FitXResult {
  model: Model
  /** 順位ごとの選択（記録用） */
  picks: Record<string, { champion: string; early: string; tails: number[] }>
}

export function fitX(history: readonly HistoryEvent[], o: FitX, target?: EventMeta): FitXResult {
  if (history.length < 5) throw new Error(`学習に使えるマラソンが ${history.length} 件しかない`)
  const durationCount = new Map<number, number>()
  for (const h of history) durationCount.set(durationHours(h.meta), (durationCount.get(durationHours(h.meta)) ?? 0) + 1)
  const durations = [...durationCount.keys()].sort((a, b) => a - b)
  const knownDurations = durations.filter((d) => (durationCount.get(d) ?? 0) >= 3)
  const thinDurations: ThinDuration[] = durations
    .filter((d) => (durationCount.get(d) ?? 0) < 3)
    .map((d) => {
      const same = history.filter((h) => durationHours(h.meta) === d)
      return { duration: d, samples: same.length, latestEventId: same[same.length - 1].meta.id, weight: THIN_WEIGHT }
    })

  const ranks: Record<string, RankModel> = {}
  const picks: FitXResult['picks'] = {}
  for (const rank of RANKS) {
    const walk0 = walkForward(history, rank)
    const walk =
      o.rate === 'mix'
        ? {
            ...walk0,
            evals: walk0.evals.map((ev) => {
              const h = history.find((x) => x.meta.id === ev.eventId) as HistoryEvent
              const shape = h.shapes.get(rank) as Shape
              const rt = rateTableFor(
                history.filter((x) => x.meta.aggregateAt < h.meta.startAt),
                rank,
                h.meta,
              )
              const er = GRID.map((p, j) => {
                const sv = shape.share[j]
                const t = rt?.[j]
                return p < 0.02 || p > 0.98 || sv == null || t == null || !(t > 0) ? null : sv / t - 1
              })
              return { ...ev, errors: Object.fromEntries(CANDIDATES.map((c) => [c, ev.errors[c].map((e, j) => geoErr(e, er[j]))])) as EventEval['errors'] }
            }),
          }
        : walk0
    const evals: EventEval[] =
      o.selection === 'ensemble'
        ? walk.evals.map((ev) => ({ ...ev, champion: ENS, errors: { ...ev.errors, [ENS]: ensembleErrors(ev.errors) } }))
        : walk.evals
    const champion = o.selection === 'ensemble' ? ENS : walk.champion
    const options = o.early === 'switch' ? SWITCHES : o.early === 'ramp' ? RAMPS : [null]
    const blendErrs = o.early === 'none' ? evals.map(() => GRID.map(() => null)) : blendErrors(history, rank, walk.evals)
    const early = walkEarly(evals, blendErrs, options)
    const withEarly = (at: (i: number) => EarlyOpt): EventEval[] =>
      evals.map((ev, i) => ({
        ...ev,
        errors: Object.fromEntries(Object.entries(ev.errors).map(([c, e]) => [c, mixErrors(e, blendErrs[i], at(i))])) as EventEval['errors'],
      }))
    const served = withEarly((i) => early.atTime[i])
    const latest = withEarly(() => early.final)
    const tails = tailCurve(served, o)
    const band = { lo: [] as (number | null)[], hi: [] as (number | null)[] }
    GRID.forEach((p, i) => {
      const xs = samplesAt(latest, champion, p, o)
      if (!enough(xs, o)) {
        band.lo.push(null)
        band.hi.push(null)
      } else {
        band.lo.push(quantile(xs, tails[i]))
        band.hi.push(quantile(xs, 1 - tails[i]))
      }
    })

    const sameAllErrs = walk.evals.map((e) => e.errors.same_all)
    const tableFor0 = (d: number) =>
      o.selection === 'ensemble'
        ? ensembleTable(CANDIDATES.map((c) => candidateTable(c, d, history, rank, sameAllErrs)))
        : candidateTable(champion, d, history, rank, sameAllErrs)
    const tableFor = (d: number) => (o.rate === 'mix' && d > 0 ? geoTables(tableFor0(d), rateTableFor(history, rank, standardMeta(d))) : tableFor0(d))
    const tables: Record<string, (number | null)[]> = {}
    for (const d of knownDurations) tables[String(d)] = early.final == null ? tableFor(d) : mixTables(tableFor(d), blendTable(d, history, rank), early.final)
    tables.all = tableFor(-1)
    if (knownDurations.length > 0) {
      tables.far_long = candidateTable('same_all', Math.max(...knownDurations), history, rank)
      tables.far_short = candidateTable('same_all', Math.min(...knownDurations), history, rank)
    }
    for (const t of thinDurations) {
      const latestShape: Shape | undefined = history.find((h) => h.meta.id === t.latestEventId)?.shapes.get(rank)
      if (!latestShape) continue
      const min = knownDurations.length > 0 ? Math.min(...knownDurations) : null
      const max = knownDurations.length > 0 ? Math.max(...knownDurations) : null
      const base = min != null && t.duration < min ? tables.far_short : max != null && t.duration > max ? tables.far_long : tables.all
      const e = early.final == null ? base : mixTables(base, blendTable(t.duration, history, rank), early.final)
      tables[thinKey(t.duration)] = thinTable(latestShape.share, e, t.weight)
    }
    // 前例の少ない長さ: 当てる回の長さと開始時刻がわかっているので（本番では日程から）、その回用の率モデルの表を借り先・thin に混ぜる
    if (o.rate === 'mix' && target) {
      const d = durationHours(target)
      if (!tables[String(d)]) {
        const rt = rateTableFor(history, rank, target)
        const thin = thinDurations.find((t) => t.duration === d)
        if (thin && tables[thinKey(d)]) {
          const latestShape = history.find((h) => h.meta.id === thin.latestEventId)?.shapes.get(rank)
          if (latestShape && rt) tables[thinKey(d)] = geoTables(tables[thinKey(d)], thinTable(latestShape.share, rt, thin.weight))
        } else {
          const min = knownDurations.length > 0 ? Math.min(...knownDurations) : null
          const max = knownDurations.length > 0 ? Math.max(...knownDurations) : null
          const key = min != null && d < min ? 'far_short' : max != null && d > max ? 'far_long' : 'all'
          if (tables[key]) tables[key] = geoTables(tables[key], rt)
        }
      }
    }
    o.tableHook?.({ history, rank, tables })
    const shown = GRID.some((p, i) => {
      const lo = band.lo[i]
      const hi = band.hi[i]
      return p >= MIN_VISIBLE_PROGRESS - 1e-9 && p <= SCORE_TO + 1e-9 && lo != null && hi != null && hi - lo <= MAX_ROUGH_WIDTH
    })
    ranks[String(rank)] = { candidate: walk.champion, minProgress: shown ? MIN_VISIBLE_PROGRESS : 1.01, tables, band }
    picks[String(rank)] = { champion: String(champion), early: optKey(early.final), tails: [tails[idx(0.1)], tails[idx(0.5)], tails[idx(0.9)]] }
  }
  const last = history[history.length - 1].meta.id
  const model: Model = { version: `${ALGORITHM}@x${last}`, createdAt: '', algorithm: ALGORITHM, grid: [...GRID], ranks, knownDurations, thinDurations }
  return { model, picks }
}

export type { EventMeta }
