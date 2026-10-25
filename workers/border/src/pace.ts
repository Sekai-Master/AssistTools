/**
 * 日報の「歴代ペース」の純粋関数。Worker（daily.ts）と解析ジョブ（analyze.ts の updatePace）が使う。
 *
 * 2026-10-25 Nori「Bでいきましょう」: 歴代ペース＝同じ経過率の時点の日速（その時点の値÷経過時間×24）で、歴代の回と比べた順位。
 * - 終値の日速と比べると、初日は勢いのある数時間だけの平均なので全順位が1位に、中盤は大きく下に振れた（221 で実測）。
 *   同じ局面どうしで比べると、初日から結果（221 は 3・3・2位）に近い順位が続く
 * - 過去の回の伸び方は、解析ジョブの「形」（経過率 2% 刻み 51 点の 値÷終値）。古い回（1〜85）は種（scripts/border/data/pace-seed.json）から
 * - 日報を出す時刻（毎日21時）の経過率は日程から前もって分かるので、解析ジョブがその経過率での過去の回の日速の並びを作って kv `pace:{id}` に置く。
 *   Worker は21時にそこから引くだけ（CPU 10ms の枠に収める）
 */
import { GRID, GRID_STEP, eventEndMs, type EventMeta, type Shape } from './model.ts'

const H = 3_600_000
/** 日報を出す時刻（日本時間 21:00 ＝ UTC 12:00）。daily.ts の「21時台か」の判定もこれを使う（2か所に直書きしない。#160 レビュー L4） */
export const DAILY_UTC_HOUR = 12

/** 日報を出す時刻の一覧（開始より後・終了より前の毎日21時）。終了の日の21時は答え合わせと歴代ボーダーが出るので含めない */
export function dailyTimes(e: Pick<EventMeta, 'startAt' | 'aggregateAt'>): number[] {
  const out: number[] = []
  const d = new Date(e.startAt)
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), DAILY_UTC_HOUR)
  if (t <= e.startAt) t += 24 * H
  for (; t < e.aggregateAt; t += 24 * H) out.push(t)
  return out
}

/** 経過率 p（0〜1）の時点の日速（値÷経過時間×24）。形が欠けていれば null */
export function dailyAtProgress(shape: Pick<Shape, 'final' | 'share'>, hours: number, p: number): number | null {
  if (!(p > 0) || p > 1 || !(hours > 0)) return null
  const x = p / GRID_STEP
  const lo = Math.floor(x)
  const hi = Math.min(GRID.length - 1, Math.ceil(x))
  const a = shape.share[lo]
  const b = shape.share[hi]
  if (a == null || b == null) return null
  const share = a + (b - a) * (x - lo)
  return ((share * shape.final) / (p * hours)) * 24
}

export interface PacePoint {
  /** 日報を出す時刻 */
  at: number
  /** その時刻の経過率 */
  progress: number
  /** 順位 → 過去の回の、その経過率での日速（大きい順・整数） */
  ranks: Record<string, number[]>
}

/**
 * 日報を出す各時刻の、過去の回の日速の並び。
 * hoursOf は過去の回の長さ（時間）。対象の回そのものと、長さの分からない回は入れない
 */
export function pacePoints(target: Pick<EventMeta, 'id' | 'startAt' | 'aggregateAt'>, shapes: readonly Shape[], hoursOf: ReadonlyMap<number, number>): PacePoint[] {
  const span = eventEndMs(target) - target.startAt
  return dailyTimes(target).map((at) => {
    const progress = (at - target.startAt) / span
    const ranks: Record<string, number[]> = {}
    for (const s of shapes) {
      const hours = hoursOf.get(s.eventId)
      if (s.eventId === target.id || hours == null) continue
      const v = dailyAtProgress(s, hours, progress)
      if (v == null) continue
      ;(ranks[String(s.rank)] ??= []).push(Math.round(v))
    }
    for (const k of Object.keys(ranks)) ranks[k].sort((a, b) => b - a)
    return { at, progress, ranks }
  })
}

/** 歴代ペースの順位（自分より日速の大きい回の数＋1）と、比べた回の数（自分を含む） */
export function paceRank(pool: readonly number[], mine: number): { pos: number; of: number } {
  return { pos: pool.filter((v) => v > mine).length + 1, of: pool.length + 1 }
}
