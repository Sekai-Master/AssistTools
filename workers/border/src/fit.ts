/**
 * モデルの学習（解析ジョブだけが使う。Worker には載せない）。
 *
 * やること:
 *   1. 終了済みマラソンの形（シェア列）を時系列順に並べ、候補モデルごとに前向き検証する
 *   2. 直近の成績で王者を決める（挑戦者が 5% 以上良ければ入れ替え）
 *   3. 王者の誤差の実測分布から、経過率ごとの非対称な帯を作る。幅は「過去に実際8割以上入った中で
 *      いちばん狭い裾」を、経過率の6区間ごとに選ぶ（固定の10〜90%だと実際は73〜80%しか入らなかった。2026-09-30 実測）。
 *      標本は1回につき1つ（経過 ±4% の誤差の平均）、直近40回
 *   4. Worker が割り算1回で予測できる形（期間ごとのシェア表＋帯）に焼き込む。期間ごとの表は王者の表と
 *      率モデル（rate.ts）の表の幾何平均で、誤差・帯・裾の選択もその混ぜた表で測り直す
 *   5. 序盤（経過率 20〜40% より前）は、伸び方を経過時間と残り時間でそろえて混ぜた表（blend）に差し替える。
 *      差し替えるか・どこまで差し替えるかは順位ごとに前向き検証で選び、現行に勝てなければ差し替えない
 *   6. 標本が1〜2件しかない長さには、その長さの直近の回を3割だけ混ぜた専用の表を焼く（thinTable。Worker は参考値として出す）
 *   7. これから始まる回の長さに前例が足りなければ、その日程の率モデルの表を借り先に混ぜて焼く（rate:長さ / thin 表）
 *
 * 人が方向の補正を足す枠は作らない（brain log 2026-09-02 §11.3）。偏りの補正は
 * 「補正つき候補」が前向き検証で勝ったときだけ自動で採用される。
 */
import {
  CANDIDATES,
  EVAL_FROM,
  EVAL_TO,
  GRID,
  MAX_ROUGH_WIDTH,
  MIN_POOL,
  PROMOTE_MARGIN,
  RANKS,
  SCORE_TO,
  candidateTable,
  durationHours,
  errorsAgainst,
  interpGrid,
  median,
  quantile,
  THIN_WEIGHT,
  rateKey,
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
import { fitRate, rateShareTable } from './rate.ts'

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
 * 序盤と中盤以降の境目（以前の帯は裾をこの前後の2つで選んでいた。いまの帯は BUCKETS の6区間で選ぶので使わない。
 * scripts/border/research/fitx.ts の PROD（以前の本番）が読む）
 */
export const EARLY_UNTIL = 0.3

/** 以前の帯の裾の候補（片側・狭い順）。いまは WIDE_TAILS を使う。fitx.ts の PROD が読む */
export const BAND_TAILS = [0.1, 0.075, 0.05, 0.035, 0.025, 0.015] as const
/** 「8割の幅」が実際に8割入るように、片側の裾をこの中から選ぶ（狭い順）。15〜85% まで狭くした帯も候補に入れる */
export const WIDE_TAILS = [0.15, 0.125, ...BAND_TAILS] as const
export const TARGET_COVERAGE = 0.8

/**
 * 帯の裾を選ぶ経過率の区間（代表の経過率と、その区間に入る格子点）。外れ方は経過率で大きく変わるので、区間ごとに裾を選び、
 * 区間の中心どうしを線形補間してつなぐ（2つの裾の段差だと、段差の前後で当たり率が片方だけ足りなくなる）
 */
export const BUCKETS: readonly { center: number; points: readonly number[] }[] = [
  { center: 0.08, points: [0.04, 0.08, 0.12] },
  { center: 0.22, points: [0.16, 0.2, 0.24, 0.28] },
  { center: 0.4, points: [0.32, 0.36, 0.4, 0.44, 0.48] },
  { center: 0.6, points: [0.52, 0.56, 0.6, 0.64, 0.68] },
  { center: 0.8, points: [0.72, 0.76, 0.8, 0.84, 0.88] },
  { center: 0.93, points: [0.9, 0.94, 0.96] },
]
/** 帯の標本に使う直近の回数 */
export const BAND_EVENTS = 40
/** 標本にする経過率の幅（p の ±これ）。1回の中のこの範囲の誤差は平均して1標本にする */
const BAND_HALF = 0.04
/** 帯を作るのに要る標本（回）の数の下限 */
export const BAND_MIN_EVENTS = 10

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
  /** 経過率 0.6 の帯に使った片側の裾（0.1 なら 10〜90パーセンタイル）。裾は経過率ごとに違う（全体は bandTails） */
  bandTail: number
  /** 帯の当たり率（前向き。その時点までのデータで作った帯に実測が入った割合）。各 p の裾で数えたもの */
  coverage: { p: number; covered: number; total: number }[]
  /** 序盤（EARLY_CHECKPOINTS）の同じもの */
  medianAbsErrorEarly: { p: number; value: number | null }[]
  bandEarly: { p: number; lo: number | null; hi: number | null }[]
  /** 経過率 0.08 の帯に使った片側の裾 */
  bandTailEarly: number
  coverageEarly: { p: number; covered: number; total: number }[]
  /** イベントごとの再現誤差（王者・代表の経過率） */
  replay: { eventId: number; champion: CandidateId; errors: { p: number; value: number | null }[] }[]
  /** 序盤の差し替え（blend）の選択。この項目より前の版には無い */
  earlyBlend?: EarlyBlendChoice
  /** 区間（BUCKETS）の中心の経過率ごとに選んだ片側の裾。帯はこの点どうしを線形補間してつなぐ。この項目より前の版には無い */
  bandTails?: { p: number; tail: number }[]
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

/**
 * 帯の標本。候補 cand の直近 BAND_EVENTS 回について、1回につき1つ、経過率 p の近く（±BAND_HALF）の誤差の平均を集める。
 * 近い格子点の誤差は同じ回の中で似ているので、全点を並べると1回の外れが何票にもなる。1回1標本にすると回の数がそのまま標本数になる
 */
export function bandSamples(evals: readonly EventEval[], cand: CandidateId, p: number): number[] {
  const xs: number[] = []
  for (const ev of evals.slice(-BAND_EVENTS)) {
    const errs = ev.errors[cand]
    const win: number[] = []
    GRID.forEach((q, j) => {
      const e = errs[j]
      if (e != null && Math.abs(q - p) <= BAND_HALF + 1e-9) win.push(e)
    })
    if (win.length > 0) xs.push(win.reduce((a, b) => a + b, 0) / win.length)
  }
  return xs
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
      const xs = bandSamples(evals.slice(0, i), cand, p)
      const e = at(evals[i].errors[cand], p)
      if (e == null || xs.length < BAND_MIN_EVENTS) continue
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
  for (const tail of WIDE_TAILS) {
    const coverage = coverageOf(evals, tail, checkpoints)
    const covered = coverage.reduce((a, c) => a + c.covered, 0)
    const total = coverage.reduce((a, c) => a + c.total, 0)
    last = { tail, coverage }
    if (total > 0 && covered / total >= TARGET_COVERAGE) return last
  }
  return last as { tail: number; coverage: RankSummary['coverage'] }
}

/** 区間（BUCKETS）の中心どうしを線形補間して、格子の全点の裾にする。最初の中心より前・最後の中心より後は端の裾 */
export function tailCurve(bucketTails: readonly number[]): number[] {
  return GRID.map((p) => {
    if (p <= BUCKETS[0].center) return bucketTails[0]
    for (let k = 1; k < BUCKETS.length; k++) {
      if (p <= BUCKETS[k].center) {
        const a = BUCKETS[k - 1].center
        const b = BUCKETS[k].center
        return bucketTails[k - 1] + ((bucketTails[k] - bucketTails[k - 1]) * (p - a)) / (b - a)
      }
    }
    return bucketTails[bucketTails.length - 1]
  })
}

/** 候補 cand の直近 BAND_EVENTS 回の誤差から、格子ごとの非対称な帯（分位点）を作る。tails は格子ごとの片側の裾 */
function bandFrom(evals: readonly EventEval[], cand: CandidateId, tails: readonly number[]): { lo: (number | null)[]; hi: (number | null)[] } {
  const lo: (number | null)[] = []
  const hi: (number | null)[] = []
  GRID.forEach((p, i) => {
    const xs = bandSamples(evals, cand, p)
    if (xs.length < BAND_MIN_EVENTS) {
      lo.push(null)
      hi.push(null)
    } else {
      lo.push(quantile(xs, tails[i]))
      hi.push(quantile(xs, 1 - tails[i]))
    }
  })
  return { lo, hi }
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

// ---------------------------------------------------------------------------
// 率モデルとの混ぜ合わせ
//
// 期間ごとの表は、その長さの前例が少ないと偏る。率モデル（rate.ts）は全マラソンの「1時間あたりの伸び率」を
// 経過時間・残り時間・時刻の関数として当てはめるので、どんな長さ・開始時刻の表も作れる。
// 期間ごとの表（王者の表）とこの表を幾何平均する。前向き検証の誤差も混ぜた表で測り直すので、
// 切り替え点・裾・帯はすべて混ぜた表に合わせて選ばれる。王者の選び方（walkForward の採点）は混ぜる前の誤差のまま
// ---------------------------------------------------------------------------

const rateCache = new Map<string, (number | null)[] | null>()
const shapeIds = new WeakMap<Shape, number>()
let shapeCount = 0
/** 形の同一性（オブジェクト）で見分ける番号。同じ id でも作り直した形は別の学習データとして扱う（テストや再読込で古い表を引かない） */
function shapeId(shape: Shape | undefined): string {
  if (!shape) return '-'
  let id = shapeIds.get(shape)
  if (id == null) {
    id = shapeCount++
    shapeIds.set(shape, id)
  }
  return String(id)
}

/**
 * history（target の開始前の回）で学習した率モデルの、target の長さ・開始時刻での表。
 * 同じ学習データ・日程は何度も使う（前向き検証で同じ過去を回ごとに学習し直す）ので覚えておく。解析ジョブは1回で終わるので上限は設けない
 */
function rateTableFor(
  history: readonly HistoryEvent[],
  rank: number,
  target: Pick<EventMeta, 'startAt' | 'aggregateAt'>,
): (number | null)[] | null {
  const key = `${rank}|${target.startAt}|${target.aggregateAt}|${history.map((h) => `${h.meta.id}.${shapeId(h.shapes.get(rank))}`).join(',')}`
  if (!rateCache.has(key)) {
    const fit = fitRate(history, rank)
    rateCache.set(key, fit ? rateShareTable(fit, target) : null)
  }
  return rateCache.get(key) ?? null
}

/** 長さ d の回（15:00 JST 開始・20:59:59 終了の標準の日程）。表は長さで引くので、開始時刻はいちばん多いものに合わせる */
function standardMeta(d: number): Pick<EventMeta, 'startAt' | 'aggregateAt'> {
  const startAt = Date.UTC(2026, 0, 1, 6) // 15:00 JST
  return { startAt, aggregateAt: startAt + d * 3_600_000 - 1000 }
}

const geo = (a: number | null, b: number | null) => (a != null && b != null && a > 0 && b > 0 ? Math.sqrt(a * b) : (a ?? b))
/** 2つの表の幾何平均。b が無ければ a のまま、片方の点が欠けていればもう片方 */
const geoTables = (a: readonly (number | null)[], b: readonly (number | null)[] | null) => (b ? a.map((v, i) => geo(v, b[i])) : [...a])
/** 表 t と率モデルの表を幾何平均したときの誤差: s/√(t·r) − 1 = √((1+e)(1+er)) − 1 */
const geoErr = (e: number | null, er: number | null) =>
  e == null ? null : er == null || 1 + er <= 0 || 1 + e <= 0 ? e : Math.sqrt((1 + e) * (1 + er)) - 1

/** 前向き検証の各回の誤差を、「その回の開始前の回で学習した率モデル（その回自身の日程）との幾何平均」で当てたときの誤差に直す */
export function rateMixed(history: readonly HistoryEvent[], rank: number, evals: readonly EventEval[]): EventEval[] {
  const byId = new Map(history.map((h) => [h.meta.id, h]))
  return evals.map((ev) => {
    const h = byId.get(ev.eventId) as HistoryEvent
    const shape = h.shapes.get(rank) as Shape
    const rt = rateTableFor(
      history.filter((x) => x.meta.aggregateAt < h.meta.startAt),
      rank,
      h.meta,
    )
    const er = GRID.map((p, j) => {
      const sv = shape.share[j]
      const t = rt?.[j]
      return p < EVAL_FROM || p > EVAL_TO || sv == null || t == null || !(t > 0) ? null : sv / t - 1
    })
    return { ...ev, errors: Object.fromEntries(CANDIDATES.map((c) => [c, ev.errors[c].map((e, j) => geoErr(e, er[j]))])) as EventEval['errors'] }
  })
}

/** これから終わる（aggregateAt が now 以降の）マラソンを、長さごとに開始がいちばん早い回で */
function upcomingByDuration(events: readonly EventMeta[], now: number): Map<number, EventMeta> {
  const out = new Map<number, EventMeta>()
  for (const e of events) {
    if (e.eventType !== 'marathon' || e.aggregateAt < now) continue
    const d = durationHours(e)
    const cur = out.get(d)
    if (!cur || e.startAt < cur.startAt) out.set(d, e)
  }
  return out
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
  const upcoming = upcomingByDuration(events, now)

  const ranks: Record<string, RankModel> = {}
  const rankSummaries: RankSummary[] = []
  for (const rank of RANKS) {
    const walk = walkForward(history, rank)
    const champion = walk.champion
    // 前向き検証の誤差は率モデルと混ぜた表のもの。王者（walk.champion）と各回の王者の記録は混ぜる前の採点で決まったまま
    const evals = rateMixed(history, rank, walk.evals)
    const blendErrs = blendErrors(history, rank, evals)
    const early = walkEarlyBlend(evals, blendErrs)
    const switchAt = early.switchAt
    // 序盤を差し替えた後の誤差で、帯・当たり率・誤差の要約を作る。差し替えるのは切り替え点より前だけで、王者の採点（経過率 0.40〜）には触れない。
    //   served … 各回を「その回の時点で選んでいた切り替え点」で差し替えた誤差。当たり率・誤差の要約・裾の選択に使う（前向きのまま）
    //   latest … 全回を最後に選んだ切り替え点で差し替えた誤差。これから出す予測の帯の分位点に使う（出す予測と同じ作り方の誤差の分布）
    const blended = (at: (i: number) => number | null): EventEval[] =>
      evals.map((ev, i) => ({
        ...ev,
        errors: Object.fromEntries(CANDIDATES.map((c) => [c, earlyBlended(ev.errors[c], blendErrs[i], at(i))])) as EventEval['errors'],
      }))
    const served = blended((i) => early.atTime[i])
    const latest = blended(() => switchAt)
    // 帯の裾は経過率の6区間ごとに選び、区間の中心どうしを線形補間でつなぐ（段差が無い）
    const bucketTails = BUCKETS.map((b) => chooseTail(served, b.points).tail)
    const tails = tailCurve(bucketTails)
    const band = bandFrom(latest, champion, tails)
    const sameAllErrs = evals.map((e) => e.errors.same_all)
    const tables: Record<string, (number | null)[]> = {}
    // 「同じ長さ」の表は標本3件以上の長さだけ。1〜2件の長さに表を作ると Worker が完全一致として使い、
    // 参考値の札（extrapolatedFrom）も帯の広げも外れる（221 の 102h が学習に入ると 222 が確度を名乗る。2026-10-26）
    // 長さがわかっているので、王者の表と、その長さ（標準の日程）の率モデルの表を幾何平均してから、序盤を blend に差し替える
    for (const d of knownDurations) {
      const base = geoTables(candidateTable(champion, d, history, rank, sameAllErrs), rateTableFor(history, rank, standardMeta(d)))
      tables[String(d)] = switchAt == null ? base : earlyBlended(base, blendTable(d, history, rank), switchAt)
    }
    // 以下の all・far_long・far_short（学習に無い長さ用）は、当てる回の長さがわからないので blend にも率モデルにも差し替えない
    // （日程のわかっている回の分は、この後で rate:長さ に別に焼く）
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
    // これから始まる回で、長さに前例が足りないもの: 日程（長さと開始時刻）がわかっているので、その日程の率モデルの表を混ぜて焼く。
    //   標本1〜2件の長さ … thin の表（直近の回を混ぜたもの）を、率モデルの表に直近の回を混ぜたものと幾何平均する
    //   過去に無い長さ     … 借り先（far_* / all）を率モデルの表と幾何平均した表を rate:長さ に焼く。
    //                        借り先そのものは、日程のわからない回のためにそのまま残す。Worker は rate:長さ があればそれを借り先の代わりに使う（chooseTable）
    for (const [d, upcomingMeta] of upcoming) {
      if (tables[String(d)]) continue
      const rt = rateTableFor(history, rank, upcomingMeta)
      if (!rt) continue
      const thin = thinDurations.find((t) => t.duration === d)
      if (thin && tables[thinKey(d)]) {
        const latest = history.find((h) => h.meta.id === thin.latestEventId)?.shapes.get(rank)
        if (latest) tables[thinKey(d)] = geoTables(tables[thinKey(d)], thinTable(latest.share, rt, thin.weight))
      } else {
        const min = knownDurations.length > 0 ? Math.min(...knownDurations) : null
        const max = knownDurations.length > 0 ? Math.max(...knownDurations) : null
        const fallback = min != null && d < min ? tables.far_short : max != null && d > max ? tables.far_long : tables.all
        tables[rateKey(d)] = geoTables(fallback, rt)
      }
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
      bandTail: at(tails, 0.6) as number,
      coverage: CHECKPOINTS.map((p) => coverageOf(served, at(tails, p) as number, [p])[0]),
      medianAbsErrorEarly: EARLY_CHECKPOINTS.map((p) => {
        const xs = recent.map((e) => at(e.errors[champion], p)).filter((v): v is number => v != null)
        return { p, value: median(xs.map(Math.abs)) }
      }),
      bandEarly: EARLY_CHECKPOINTS.map((p) => ({ p, lo: at(band.lo, p), hi: at(band.hi, p) })),
      bandTailEarly: at(tails, 0.08) as number,
      coverageEarly: EARLY_CHECKPOINTS.map((p) => coverageOf(served, at(tails, p) as number, [p])[0]),
      replay: served.slice(-12).map((e) => ({
        eventId: e.eventId,
        champion: e.champion,
        errors: CHECKPOINTS.map((p) => ({ p, value: at(e.errors[e.champion], p) })),
      })),
      earlyBlend: { switchAt, scores: early.scores, scoredEvents: early.scoredEvents },
      bandTails: BUCKETS.map((b, k) => ({ p: b.center, tail: bucketTails[k] })),
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
