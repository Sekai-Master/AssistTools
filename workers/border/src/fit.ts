/**
 * モデルの学習（解析ジョブだけが使う。Worker には載せない）。
 *
 * やること:
 *   1. 終了済みマラソンの形（シェア列）を時系列順に並べ、候補モデルごとに前向き検証する
 *   2. 直近の成績で王者を決める（挑戦者が 5% 以上良ければ入れ替え）
 *   3. 王者の誤差の実測分布から、経過率ごとの非対称な帯を作る。幅は「過去に実際8割以上入った中で
 *      いちばん狭い裾」を順位帯ごとに選ぶ（固定の10〜90%だと実際は73〜80%しか入らなかった。2026-09-30 実測）
 *   4. Worker が割り算1回で予測できる形（期間ごとのシェア表＋帯）に焼き込む
 *   5. 序盤（経過率 20〜40% より前）は、伸び方を経過時間と残り時間でそろえて混ぜた表（blend）に差し替える。
 *      差し替えるか・どこまで差し替えるかは順位ごとに前向き検証で選び、現行に勝てなければ差し替えない
 *   6. 標本が1〜2件しかない長さには、その長さの直近の回を3割だけ混ぜた専用の表を焼く（thinTable。Worker は参考値として出す）
 *
 * 人が方向の補正を足す枠は作らない（brain log 2026-09-02 §11.3）。偏りの補正は
 * 「補正つき候補」が前向き検証で勝ったときだけ自動で採用される。
 */
import {
  BAND_MIN_SAMPLES,
  CANDIDATES,
  GRID,
  MAX_ROUGH_WIDTH,
  MIN_POOL,
  PROMOTE_MARGIN,
  RANKS,
  SCORE_TO,
  bandSamplesAt,
  bandsFrom,
  candidateTable,
  durationHours,
  errorsAgainst,
  interpGrid,
  median,
  quantile,
  THIN_WEIGHT,
  thinKey,
  walkForward,
  type CandidateId,
  type EventMeta,
  type EventEval,
  type HistoryEvent,
  type Model,
  type RankModel,
  type Shape,
  type ThinDuration,
} from './model.ts'

export const ALGORITHM = 'share-median-v1' as const

/**
 * 表に出す最初の経過率（150h のイベントで開始6時間）。
 * これより後は、帯が MAX_ROUGH_WIDTH 以内なら確度つきで出す（広い序盤は「目安」）
 */
export const MIN_VISIBLE_PROGRESS = 0.04

/** 採点・表示に使う代表の経過率（中盤以降） */
export const CHECKPOINTS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.96] as const
/** 序盤の代表の経過率（150h で 6h / 12h / 24h / 36h） */
export const EARLY_CHECKPOINTS = [0.04, 0.08, 0.16, 0.24] as const
/**
 * 序盤と中盤以降の境目。帯の裾はそれぞれで選ぶ。
 * 序盤は外れ方がずっと大きいので、同じ裾で揃えると片方だけ当たり率が足りなくなる
 */
export const EARLY_UNTIL = 0.3

/** 「8割の幅」が実際に8割入るように、片側の裾をこの中から選ぶ（狭い順） */
export const BAND_TAILS = [0.1, 0.075, 0.05, 0.035, 0.025, 0.015] as const
export const TARGET_COVERAGE = 0.8

/** Worker が毎回読むので、表の桁を落として小さくする（予測への影響は 1e-5 未満） */
const round5 = (v: number | null) => (v == null ? null : Math.round(v * 1e5) / 1e5)

/** 版名用の短いハッシュ（FNV-1a 32bit）。暗号用途ではない */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export interface RankSummary {
  rank: number
  champion: CandidateId
  /** 直近8件の平均スコア（|誤差| の中央値の平均）。候補ごと */
  rolling: Record<CandidateId, number | null>
  /** 前向き検証した件数 */
  evaluated: number
  minProgress: number
  /** 代表の経過率ごとの、王者の |誤差| 中央値（直近20件） */
  medianAbsError: { p: number; value: number | null }[]
  /** 代表の経過率ごとの帯（誤差の分位点） */
  band: { p: number; lo: number | null; hi: number | null }[]
  /** 帯に使った片側の裾（0.1 なら 10〜90パーセンタイル） */
  bandTail: number
  /** 帯の当たり率（前向き。その時点までのデータで作った帯に実測が入った割合）。選んだ裾のもの */
  coverage: { p: number; covered: number; total: number }[]
  /** 序盤（EARLY_CHECKPOINTS）の同じもの */
  medianAbsErrorEarly: { p: number; value: number | null }[]
  bandEarly: { p: number; lo: number | null; hi: number | null }[]
  bandTailEarly: number
  coverageEarly: { p: number; covered: number; total: number }[]
  /** イベントごとの再現誤差（王者・代表の経過率） */
  replay: { eventId: number; champion: CandidateId; errors: { p: number; value: number | null }[] }[]
  /** 序盤の差し替え（blend）の選択。この項目より前の版には無い */
  earlyBlend?: EarlyBlendChoice
}

export interface ModelSummary {
  version: string
  algorithm: typeof ALGORITHM
  createdAt: string
  trainedThrough: number
  poolSize: number
  durations: number[]
  /** 標本1〜2件の長さと、表に混ぜた回。この項目より前の版には無い */
  thinDurations?: ThinDuration[]
  targetCoverage: number
  ranks: RankSummary[]
}

export interface FitResult {
  model: Model
  summary: ModelSummary
}

function at(values: readonly (number | null)[], p: number): number | null {
  const i = Math.round(p / (GRID[1] - GRID[0]))
  return values[i] ?? null
}

/**
 * 表に出し始める経過率。いまは全順位 MIN_VISIBLE_PROGRESS（開始6時間）で固定する。
 * 幅が広すぎる・帯が無い時点は predict() の確度（null）で1点ずつ隠れるので、ここで経過率を切る必要は無い。
 * ★ 以前は「後ろから見て帯が崩れた点で打ち切る」走査をしていたが、途中に1点だけ欠け・広すぎる点があると
 *   そこより前がまるごと隠れる（序盤と中盤以降で帯をつなぐ 0.3 の段差でも起きうる）ので、やめた（レビュー 2026-09-30）
 */
function minProgressFrom(band: { lo: (number | null)[]; hi: (number | null)[] }): number {
  const shown = GRID.some((p, i) => {
    const lo = band.lo[i]
    const hi = band.hi[i]
    return p >= MIN_VISIBLE_PROGRESS - 1e-9 && p <= SCORE_TO + 1e-9 && lo != null && hi != null && hi - lo <= MAX_ROUGH_WIDTH
  })
  // どの時点でも出せない順位は、表示しない印として 1 より大きい値を返す（画面は「出していません」と出す）
  return shown ? MIN_VISIBLE_PROGRESS : 1.01
}

/** 裾 tail の帯が、前向き（その時点までのデータで作った帯）で実測をどれだけ含んだか */
export function coverageOf(
  evals: readonly EventEval[],
  tail: number,
  checkpoints: readonly number[] = CHECKPOINTS,
): RankSummary['coverage'] {
  return checkpoints.map((p) => {
    let covered = 0
    let total = 0
    for (let i = 10; i < evals.length; i++) {
      const cand = evals[i].champion
      const xs = bandSamplesAt(evals.slice(0, i), cand, p)
      const e = at(evals[i].errors[cand], p)
      if (e == null || xs.length < BAND_MIN_SAMPLES) continue
      const lo = quantile(xs, tail) as number
      const hi = quantile(xs, 1 - tail) as number
      total++
      if (e >= lo && e <= hi) covered++
    }
    return { p, covered, total }
  })
}

/** 目標の当たり率を満たすいちばん狭い裾。どれも満たさなければいちばん広いもの */
export function chooseTail(
  evals: readonly EventEval[],
  checkpoints: readonly number[] = CHECKPOINTS,
): { tail: number; coverage: RankSummary['coverage'] } {
  let last: { tail: number; coverage: RankSummary['coverage'] } | null = null
  for (const tail of BAND_TAILS) {
    const coverage = coverageOf(evals, tail, checkpoints)
    const covered = coverage.reduce((a, c) => a + c.covered, 0)
    const total = coverage.reduce((a, c) => a + c.total, 0)
    last = { tail, coverage }
    if (total > 0 && covered / total >= TARGET_COVERAGE) return last
  }
  return last as { tail: number; coverage: RankSummary['coverage'] }
}

// ---------------------------------------------------------------------------
// 序盤の差し替え（blend）
//
// 長さの違う過去の回を経過の割合でそろえると、序盤の伸び方がずれる（221 = 102h で 150h の回の形を借りて大きく外した）。
// そこで全マラソンを「開始からの経過時間」と「終了までの残り時間」の両方でそろえ、経過率 p で重みを付けて混ぜる:
//   share(p) = (1 − p) × 中央値[経過時間でそろえた share] + p × 中央値[残り時間でそろえた share]
// 実験（border-research/experiments/alignment-3.md、77回）では序盤（〜24%）は現行より当たり、50% 以降は現行が勝った。
// そこで切り替え点より前だけを差し替える。221 の 1000位の外れ（4% で −37%）はどのそろえ方でも直らなかった
// ---------------------------------------------------------------------------

/** 切り替え点の候補（経過率）。この経過率より前を blend にする */
export const BLEND_SWITCH_POINTS = [0.2, 0.3, 0.4] as const
/** 差し替えの採点に使う経過率の範囲。表に出し始める時点から、いちばん遅い切り替え点の手前まで（どの候補も同じ範囲で比べる） */
const BLEND_SCORE_FROM = MIN_VISIBLE_PROGRESS
const BLEND_SCORE_TO = Math.max(...BLEND_SWITCH_POINTS)
/** 比べる件数（直近）。序盤の誤差はばらつきが大きいので、王者を選ぶ 8 件より長く見る */
export const BLEND_WINDOW = 20
/** 採点できた回がこれより少ないうちは差し替えない */
export const BLEND_MIN_EVENTS = 10

/** 過去の形の、経過の割合 q でのシェア。0〜1 の外は null */
function shareAtProgress(shape: Shape, q: number): number | null {
  return q >= 0 && q <= 1 ? interpGrid(shape.share, q) : null
}

/**
 * 長さ duration（時間）の回に当てる blend の表。history は対象の開始前に終わった回だけ（リーク防止は呼び出し側）。
 * 期間を問わず全マラソンを使う。経過時間・残り時間のどちらかで MIN_POOL 件そろわない点は null（呼び出し側で現行の表に戻す）
 */
export function blendTable(duration: number, history: readonly HistoryEvent[], rank: number): (number | null)[] {
  const pool = history.flatMap((h) => {
    const shape = h.shapes.get(rank)
    return shape ? [{ shape, ratio: duration / durationHours(h.meta) }] : []
  })
  return GRID.map((p) => {
    const byElapsed: number[] = []
    const byRemaining: number[] = []
    for (const { shape, ratio } of pool) {
      const a = shareAtProgress(shape, p * ratio)
      if (a != null && a > 0) byElapsed.push(a)
      const b = shareAtProgress(shape, 1 - (1 - p) * ratio)
      if (b != null && b > 0) byRemaining.push(b)
    }
    if (byElapsed.length < MIN_POOL || byRemaining.length < MIN_POOL) return null
    return (1 - p) * (median(byElapsed) as number) + p * (median(byRemaining) as number)
  })
}

/**
 * 前向き検証の各回（evals と同じ並び）について、blend で当てたときの誤差列。
 * walkForward と同じく、対象の開始前に終わった回だけで表を作る
 */
export function blendErrors(history: readonly HistoryEvent[], rank: number, evals: readonly EventEval[]): (number | null)[][] {
  const byId = new Map(history.map((h) => [h.meta.id, h]))
  return evals.map((ev) => {
    const target = byId.get(ev.eventId)
    const shape = target?.shapes.get(rank)
    if (!target || !shape) throw new Error(`前向き検証の回 ${ev.eventId} の ${rank}位の形が履歴に無い`)
    const before = history.filter((h) => h.meta.aggregateAt < target.meta.startAt)
    return errorsAgainst(shape, blendTable(ev.duration, before, rank))
  })
}

/** 列 base の、経過率 switchAt より前を blend に差し替える（blend が null の点は base のまま）。表にも誤差列にも使う */
export function earlyBlended(
  base: readonly (number | null)[],
  blend: readonly (number | null)[],
  switchAt: number | null,
): (number | null)[] {
  if (switchAt == null) return [...base]
  return base.map((v, i) => (GRID[i] < switchAt - 1e-9 ? (blend[i] ?? v) : v))
}

/** 1回の採点: 序盤（BLEND_SCORE_FROM〜BLEND_SCORE_TO の手前）の |誤差| の中央値 */
function earlyScore(errs: readonly (number | null)[]): number | null {
  const xs: number[] = []
  GRID.forEach((p, i) => {
    const e = errs[i]
    if (p >= BLEND_SCORE_FROM - 1e-9 && p < BLEND_SCORE_TO - 1e-9 && e != null) xs.push(Math.abs(e))
  })
  return xs.length >= 5 ? median(xs) : null
}

export interface EarlyBlendChoice {
  /** この経過率より前を blend にする。null なら差し替えない（現行のまま） */
  switchAt: number | null
  /** 切り替え点の候補ごとの、直近 BLEND_WINDOW 件の平均スコア（序盤の |誤差| の中央値の平均）。switchAt: null が現行 */
  scores: { switchAt: number | null; score: number | null }[]
  /** 平均に入った回の数 */
  scoredEvents: number
}

const SWITCH_OPTIONS: readonly (number | null)[] = [null, ...BLEND_SWITCH_POINTS]

/** 直近 BLEND_WINDOW 件で、切り替え点の候補ごとの平均スコア。現行は各回でその時点の王者が出していた誤差 */
function switchScores(evals: readonly EventEval[], blend: readonly (number | null)[][]): Omit<EarlyBlendChoice, 'switchAt'> {
  const from = Math.max(0, evals.length - BLEND_WINDOW)
  const sums = SWITCH_OPTIONS.map(() => 0)
  let scoredEvents = 0
  for (let i = from; i < evals.length; i++) {
    const current = evals[i].errors[evals[i].champion]
    const scores = SWITCH_OPTIONS.map((s) => earlyScore(earlyBlended(current, blend[i], s)))
    // どの候補も同じ回の集まりで比べる（blend が null の点は現行に戻るので、現行が採点できればどれも採点できる）
    if (scores.some((v) => v == null)) continue
    scores.forEach((v, k) => (sums[k] += v as number))
    scoredEvents++
  }
  return {
    scores: SWITCH_OPTIONS.map((s, k) => ({ switchAt: s, score: scoredEvents > 0 ? round5(sums[k] / scoredEvents) : null })),
    scoredEvents,
  }
}

/** いまの切り替え点 current より PROMOTE_MARGIN（5%）以上良い候補があれば入れ替える。王者の入れ替えと同じヒステリシス */
function pickSwitch(current: number | null, evals: readonly EventEval[], blend: readonly (number | null)[][]): EarlyBlendChoice {
  const { scores, scoredEvents } = switchScores(evals, blend)
  if (scoredEvents < BLEND_MIN_EVENTS) return { switchAt: current, scores, scoredEvents }
  const scoreOf = (s: number | null) => scores.find((x) => x.switchAt === s)?.score ?? Infinity
  let best = current
  for (const s of SWITCH_OPTIONS) if (scoreOf(s) < scoreOf(best)) best = s
  const switchAt = best !== current && scoreOf(best) < scoreOf(current) * PROMOTE_MARGIN ? best : current
  return { switchAt, scores, scoredEvents }
}

/**
 * 切り替え点の前向き検証。各回を「その回より前の回だけで選んだ切り替え点」で当て（atTime）、最後に次の回に使う切り替え点を返す。
 * 最初は差し替えなし（現行）から始める
 */
export function walkEarlyBlend(
  evals: readonly EventEval[],
  blend: readonly (number | null)[][],
): EarlyBlendChoice & { atTime: (number | null)[] } {
  let choice: EarlyBlendChoice = { switchAt: null, ...switchScores([], []) }
  const atTime: (number | null)[] = []
  for (let i = 0; i < evals.length; i++) {
    atTime.push(choice.switchAt)
    choice = pickSwitch(choice.switchAt, evals.slice(0, i + 1), blend.slice(0, i + 1))
  }
  return { ...choice, atTime }
}

// ---------------------------------------------------------------------------
// 標本が1〜2件しかない長さ（thin、2026-10-26）
//
// 222（102h）の前例は 221 の1件だけ。#171 で「同じ長さ」の表は標本3件以上の長さだけにし、1〜2件の長さは
// 過去に無い長さとして far_short / far_long / all を借りる（参考値の札と広い帯）。ここではその借り先に、
// 同じ長さの直近の回の share を THIN_WEIGHT だけ混ぜた表を、その長さ専用に焼く（借り先の序盤は blend に差し替える）。
// 前向きの比較（border-research/experiments/thin-duration-2.md。同じ長さの前例を直近の1件だけ残した 57 回 × 6順位）:
//   全順位の |誤差| の中央値 経過4〜8% 7.9→7.0%、10〜18% 7.5→6.5%、20〜28% 5.9→6.0%、30〜48% 5.5→4.8〜5.0%、50〜70% 4.2→3.8%、72〜96% 2.7→2.6%
//   直近の1件をそのまま使う（重み 1）と、どの区間も借り先より悪い（4〜8% で 9.1%）。重み 0.5 以上は序盤で悪くなる
// 標本1件なので確度は名乗らない。Worker は過去に無い長さと同じく参考値（extrapolatedFrom）にして帯を広げる（model.ts の chooseTable）
// ---------------------------------------------------------------------------

/**
 * 標本1〜2件の長さの表。latest（同じ長さの直近の回の share）を weight、base（借り先の表）を 1 − weight で混ぜる。
 * base が無い点は出さない（1件の形だけで予測しない）。latest が無い点（欠測）は base のまま
 */
export function thinTable(
  latest: readonly (number | null)[],
  base: readonly (number | null)[],
  weight: number = THIN_WEIGHT,
): (number | null)[] {
  return base.map((b, i) => {
    const a = latest[i]
    if (b == null) return null
    if (a == null || !(a > 0)) return b
    return weight * a + (1 - weight) * b
  })
}

function historyFrom(events: readonly EventMeta[], shapes: readonly Shape[], now: number): HistoryEvent[] {
  const byEvent = new Map<number, Map<number, Shape>>()
  for (const s of shapes) {
    const m = byEvent.get(s.eventId) ?? new Map<number, Shape>()
    m.set(s.rank, s)
    byEvent.set(s.eventId, m)
  }
  return events
    .filter((e) => e.eventType === 'marathon' && e.aggregateAt < now && byEvent.has(e.id))
    .sort((a, b) => a.startAt - b.startAt)
    .map((meta) => ({ meta, shapes: byEvent.get(meta.id) as Map<number, Shape> }))
}

export function fitModel(events: readonly EventMeta[], shapes: readonly Shape[], now: number): FitResult {
  const history = historyFrom(events, shapes, now)
  if (history.length < 5) throw new Error(`学習に使えるマラソンが ${history.length} 件しかない`)
  const trainedThrough = history[history.length - 1].meta.id
  const durations = [...new Set(history.map((h) => durationHours(h.meta)))].sort((a, b) => a - b)
  const durationCount = new Map<number, number>()
  for (const h of history) durationCount.set(durationHours(h.meta), (durationCount.get(durationHours(h.meta)) ?? 0) + 1)
  const knownDurations = durations.filter((d) => (durationCount.get(d) ?? 0) >= 3)
  const thinDurations: ThinDuration[] = durations
    .filter((d) => (durationCount.get(d) ?? 0) < 3)
    .map((d) => {
      const same = history.filter((h) => durationHours(h.meta) === d)
      return { duration: d, samples: same.length, latestEventId: same[same.length - 1].meta.id, weight: THIN_WEIGHT }
    })
  const createdAt = new Date(now).toISOString()

  const ranks: Record<string, RankModel> = {}
  const rankSummaries: RankSummary[] = []
  for (const rank of RANKS) {
    const walk = walkForward(history, rank)
    const champion = walk.champion
    const blendErrs = blendErrors(history, rank, walk.evals)
    const early = walkEarlyBlend(walk.evals, blendErrs)
    const switchAt = early.switchAt
    // 序盤を差し替えた後の誤差で、帯・当たり率・誤差の要約を作る。差し替えるのは切り替え点より前だけで、王者の採点（経過率 0.40〜）には触れない。
    //   served … 各回を「その回の時点で選んでいた切り替え点」で差し替えた誤差。当たり率・誤差の要約・裾の選択に使う（前向きのまま）
    //   latest … 全回を最後に選んだ切り替え点で差し替えた誤差。これから出す予測の帯の分位点に使う（出す予測と同じ作り方の誤差の分布）
    const blended = (at: (i: number) => number | null): EventEval[] =>
      walk.evals.map((ev, i) => ({
        ...ev,
        errors: Object.fromEntries(CANDIDATES.map((c) => [c, earlyBlended(ev.errors[c], blendErrs[i], at(i))])) as EventEval['errors'],
      }))
    const served = blended((i) => early.atTime[i])
    const latest = blended(() => switchAt)
    // 帯の裾は序盤と中盤以降で別々に選び、境目（EARLY_UNTIL）でつなぐ
    const calibrated = chooseTail(served)
    const calibratedEarly = chooseTail(served, EARLY_CHECKPOINTS)
    const bandMain = bandsFrom(latest, champion, calibrated.tail)
    const bandEarly = bandsFrom(latest, champion, calibratedEarly.tail)
    const band = {
      lo: GRID.map((p, i) => (p < EARLY_UNTIL - 1e-9 ? bandEarly.lo[i] : bandMain.lo[i])),
      hi: GRID.map((p, i) => (p < EARLY_UNTIL - 1e-9 ? bandEarly.hi[i] : bandMain.hi[i])),
    }
    const sameAllErrs = walk.evals.map((e) => e.errors.same_all)
    const tables: Record<string, (number | null)[]> = {}
    // 「同じ長さ」の表は標本3件以上の長さだけ。1〜2件の長さに表を作ると Worker が完全一致として使い、
    // 参考値の札（extrapolatedFrom）も帯の広げも外れる（221 の 102h が学習に入ると 222 が確度を名乗る。2026-10-26）
    for (const d of knownDurations) {
      const base = candidateTable(champion, d, history, rank, sameAllErrs)
      tables[String(d)] = switchAt == null ? base : earlyBlended(base, blendTable(d, history, rank), switchAt)
    }
    // 以下の all・far_long・far_short（学習に無い長さ用）は、当てる回の長さがわからないので blend に差し替えない
    // 期間 -1 は「同じ期間」が無いので全マラソンへフォールバックする
    tables.all = candidateTable(champion, -1, history, rank, sameAllErrs)
    // 過去に無い長さ用: いちばん長い／短い期間（標本3件以上）の表。候補によらず「その期間の全履歴」で作る
    //（直近12件のように期間を見ない候補だと、長さの違いがそのまま偏りになる。2026-09-30 の 219 = 246h で発覚）
    if (knownDurations.length > 0) {
      tables.far_long = candidateTable('same_all', Math.max(...knownDurations), history, rank)
      tables.far_short = candidateTable('same_all', Math.min(...knownDurations), history, rank)
    }
    // 標本1〜2件の長さ: 借り先（Worker が過去に無い長さとして使う表）に、同じ長さの直近の回を THIN_WEIGHT だけ混ぜる。
    // 長さがわかっているので、借り先の序盤は期間ごとの表と同じく blend に差し替える。直近の回にこの順位の形が無ければ作らない（借り先のまま）
    for (const t of thinDurations) {
      const latest = history.find((h) => h.meta.id === t.latestEventId)?.shapes.get(rank)
      if (!latest) continue
      const min = knownDurations.length > 0 ? Math.min(...knownDurations) : null
      const max = knownDurations.length > 0 ? Math.max(...knownDurations) : null
      const base =
        min != null && t.duration < min ? tables.far_short : max != null && t.duration > max ? tables.far_long : tables.all
      const early = switchAt == null ? base : earlyBlended(base, blendTable(t.duration, history, rank), switchAt)
      tables[thinKey(t.duration)] = thinTable(latest.share, early, t.weight)
    }
    const minProgress = minProgressFrom(band)
    ranks[String(rank)] = {
      candidate: champion,
      minProgress,
      tables: Object.fromEntries(Object.entries(tables).map(([d, t]) => [d, t.map(round5)])),
      band: { lo: band.lo.map(round5), hi: band.hi.map(round5) },
      ...(switchAt == null ? {} : { earlyBlendUntil: switchAt }),
    }

    const recent = served.slice(-20)
    rankSummaries.push({
      rank,
      champion,
      rolling: walk.rolling,
      evaluated: walk.evals.length,
      minProgress,
      medianAbsError: CHECKPOINTS.map((p) => {
        const xs = recent.map((e) => at(e.errors[champion], p)).filter((v): v is number => v != null)
        return { p, value: median(xs.map(Math.abs)) }
      }),
      band: CHECKPOINTS.map((p) => ({ p, lo: at(band.lo, p), hi: at(band.hi, p) })),
      bandTail: calibrated.tail,
      coverage: calibrated.coverage,
      medianAbsErrorEarly: EARLY_CHECKPOINTS.map((p) => {
        const xs = recent.map((e) => at(e.errors[champion], p)).filter((v): v is number => v != null)
        return { p, value: median(xs.map(Math.abs)) }
      }),
      bandEarly: EARLY_CHECKPOINTS.map((p) => ({ p, lo: at(band.lo, p), hi: at(band.hi, p) })),
      bandTailEarly: calibratedEarly.tail,
      coverageEarly: calibratedEarly.coverage,
      replay: served.slice(-12).map((e) => ({
        eventId: e.eventId,
        champion: e.champion,
        errors: CHECKPOINTS.map((p) => ({ p, value: at(e.errors[e.champion], p) })),
      })),
      earlyBlend: { switchAt, scores: early.scores, scoredEvents: early.scoredEvents },
    })
  }

  // 版名には中身のハッシュを入れる。学習データが同じでもロジックを直せば別の版になり、切り替わる（レビュー 2026-09-30）
  const version = `${ALGORITHM}@e${trainedThrough}-${fnv1a(JSON.stringify({ ranks, knownDurations, thinDurations }))}`
  const model: Model = { version, createdAt, algorithm: ALGORITHM, grid: [...GRID], ranks, knownDurations, thinDurations }
  const summary: ModelSummary = {
    version,
    algorithm: ALGORITHM,
    createdAt,
    trainedThrough,
    poolSize: history.length,
    durations,
    thinDurations,
    targetCoverage: TARGET_COVERAGE,
    ranks: rankSummaries,
  }
  return { model, summary }
}

/** 候補名の一覧（レポート用） */
export const CANDIDATE_IDS: readonly CandidateId[] = CANDIDATES
