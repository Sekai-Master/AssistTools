/**
 * モデルの学習（解析ジョブだけが使う。Worker には載せない）。
 *
 * やること:
 *   1. 終了済みマラソンの形（シェア列）を時系列順に並べ、候補モデルごとに前向き検証する
 *   2. 直近の成績で王者を決める（挑戦者が 5% 以上良ければ入れ替え）
 *   3. 王者の誤差の実測分布から、経過率ごとの非対称な帯を作る。幅は「過去に実際8割以上入った中で
 *      いちばん狭い裾」を順位帯ごとに選ぶ（固定の10〜90%だと実際は73〜80%しか入らなかった。2026-09-30 実測）
 *   4. Worker が割り算1回で予測できる形（期間ごとのシェア表＋帯）に焼き込む
 *
 * 人が方向の補正を足す枠は作らない（brain log 2026-09-02 §11.3）。偏りの補正は
 * 「補正つき候補」が前向き検証で勝ったときだけ自動で採用される。
 */
import {
  BAND_MIN_SAMPLES,
  CANDIDATES,
  GRID,
  MAX_ROUGH_WIDTH,
  RANKS,
  SCORE_TO,
  bandSamplesAt,
  bandsFrom,
  candidateTable,
  durationHours,
  median,
  quantile,
  walkForward,
  type CandidateId,
  type EventMeta,
  type EventEval,
  type HistoryEvent,
  type Model,
  type RankModel,
  type Shape,
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
}

export interface ModelSummary {
  version: string
  algorithm: typeof ALGORITHM
  createdAt: string
  trainedThrough: number
  poolSize: number
  durations: number[]
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

function minProgressFrom(band: { lo: (number | null)[]; hi: (number | null)[] }): number {
  let candidate: number | null = null
  for (let i = GRID.length - 1; i >= 0; i--) {
    const p = GRID[i]
    // 端（0.96 より後）は標本が少なく帯が欠けやすいので、ここに引きずられて順位ごと隠れないようにする
    if (p > SCORE_TO + 1e-9) continue
    if (p < MIN_VISIBLE_PROGRESS - 1e-9) break
    const lo = band.lo[i]
    const hi = band.hi[i]
    if (lo == null || hi == null || hi - lo > MAX_ROUGH_WIDTH) break
    candidate = p
  }
  return candidate ?? 1.01
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
  const createdAt = new Date(now).toISOString()

  const ranks: Record<string, RankModel> = {}
  const rankSummaries: RankSummary[] = []
  for (const rank of RANKS) {
    const walk = walkForward(history, rank)
    const champion = walk.champion
    // 帯の裾は序盤と中盤以降で別々に選び、境目（EARLY_UNTIL）でつなぐ
    const calibrated = chooseTail(walk.evals)
    const calibratedEarly = chooseTail(walk.evals, EARLY_CHECKPOINTS)
    const bandMain = bandsFrom(walk.evals, champion, calibrated.tail)
    const bandEarly = bandsFrom(walk.evals, champion, calibratedEarly.tail)
    const band = {
      lo: GRID.map((p, i) => (p < EARLY_UNTIL - 1e-9 ? bandEarly.lo[i] : bandMain.lo[i])),
      hi: GRID.map((p, i) => (p < EARLY_UNTIL - 1e-9 ? bandEarly.hi[i] : bandMain.hi[i])),
    }
    const sameAllErrs = walk.evals.map((e) => e.errors.same_all)
    const tables: Record<string, (number | null)[]> = {}
    for (const d of durations) tables[String(d)] = candidateTable(champion, d, history, rank, sameAllErrs)
    // 期間 -1 は「同じ期間」が無いので全マラソンへフォールバックする
    tables.all = candidateTable(champion, -1, history, rank, sameAllErrs)
    const minProgress = minProgressFrom(band)
    ranks[String(rank)] = {
      candidate: champion,
      minProgress,
      tables: Object.fromEntries(Object.entries(tables).map(([d, t]) => [d, t.map(round5)])),
      band: { lo: band.lo.map(round5), hi: band.hi.map(round5) },
    }

    const recent = walk.evals.slice(-20)
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
      replay: walk.evals.slice(-12).map((e) => ({
        eventId: e.eventId,
        champion: e.champion,
        errors: CHECKPOINTS.map((p) => ({ p, value: at(e.errors[e.champion], p) })),
      })),
    })
  }

  // 版名には中身のハッシュを入れる。学習データが同じでもロジックを直せば別の版になり、切り替わる（レビュー 2026-09-30）
  const version = `${ALGORITHM}@e${trainedThrough}-${fnv1a(JSON.stringify(ranks))}`
  const model: Model = { version, createdAt, algorithm: ALGORITHM, grid: [...GRID], ranks }
  const summary: ModelSummary = {
    version,
    algorithm: ALGORITHM,
    createdAt,
    trainedThrough,
    poolSize: history.length,
    durations,
    targetCoverage: TARGET_COVERAGE,
    ranks: rankSummaries,
  }
  return { model, summary }
}

/** 候補名の一覧（レポート用） */
export const CANDIDATE_IDS: readonly CandidateId[] = CANDIDATES
