/**
 * 答え合わせのレポート（純粋関数）。予測ログを実測の終値で採点する。
 */
import type { ModelSummary } from '../../workers/border/src/fit.ts'
import { RANKS, durationHours, type EventMeta, type Model, type RankModel } from '../../workers/border/src/model.ts'

/** Worker の /admin/predictions が返す1行 */
export interface PredictionLog {
  event_id: number
  rank: number
  ts: number
  model_version: string
  progress: number
  current: number
  share: number
  predicted: number
  low: number | null
  high: number | null
  visible: number
}

/** 採点する時点（経過率）。この時点までに出ていた最新の予測を使う */
export const REPORT_CHECKPOINTS = [0.5, 0.7, 0.85, 0.95] as const
/** 時点より前の予測がこれ以上古ければ「その時点の予測は無かった」とする */
const MAX_STALENESS = 0.08

export interface ProspectiveScore {
  checkpoint: number
  progress: number
  modelVersion: string
  predicted: number
  low: number | null
  high: number | null
  /** 予測 ÷ 実測 − 1 */
  error: number
  inBand: boolean | null
  visible: boolean
}

export interface Report {
  eventId: number
  name: string
  unit: string
  durationHours: number
  startAt: number
  aggregateAt: number
  generatedAt: string
  modelVersions: string[]
  ranks: {
    rank: number
    final: number
    prospective: ProspectiveScore[]
    /** 前向き検証での再現誤差（その時点までのデータだけで作ったモデル）。経過率ごと */
    replay: { p: number; error: number | null }[] | null
  }[]
}

export function buildReport(
  e: EventMeta,
  finals: ReadonlyMap<string, number>,
  preds: readonly PredictionLog[],
  summary: ModelSummary,
  now: number,
): Report {
  const ranks: Report['ranks'] = []
  for (const rank of RANKS) {
    const final = finals.get(`${e.id}:${rank}`)
    if (final == null) continue
    const mine = preds.filter((p) => p.rank === rank).sort((a, b) => a.ts - b.ts)
    const prospective: ProspectiveScore[] = []
    for (const c of REPORT_CHECKPOINTS) {
      const before = mine.filter((p) => p.progress <= c + 0.005)
      const p = before[before.length - 1]
      if (!p || c - p.progress > MAX_STALENESS) continue
      prospective.push({
        checkpoint: c,
        progress: p.progress,
        modelVersion: p.model_version,
        predicted: p.predicted,
        low: p.low,
        high: p.high,
        error: p.predicted / final - 1,
        inBand: p.low == null || p.high == null ? null : final >= p.low && final <= p.high,
        visible: p.visible === 1,
      })
    }
    const replayRow = summary.ranks.find((r) => r.rank === rank)?.replay.find((x) => x.eventId === e.id)
    ranks.push({
      rank,
      final,
      prospective,
      replay: replayRow ? replayRow.errors.map((x) => ({ p: x.p, error: x.value })) : null,
    })
  }
  return {
    eventId: e.id,
    name: e.name,
    unit: e.unit,
    durationHours: durationHours(e),
    startAt: e.startAt,
    aggregateAt: e.aggregateAt,
    generatedAt: new Date(now).toISOString(),
    modelVersions: [...new Set(preds.map((p) => p.model_version))],
    ranks,
  }
}

const round5 = (v: number | null) => (v == null ? null : Math.round(v * 1e5) / 1e5)

/** Worker が毎回読むので、表の桁を落として小さくする（予測への影響は 1e-5 未満） */
export function roundModel(model: Model): Model {
  const ranks: Record<string, RankModel> = {}
  for (const [k, r] of Object.entries(model.ranks)) {
    ranks[k] = {
      ...r,
      tables: Object.fromEntries(Object.entries(r.tables).map(([d, t]) => [d, t.map(round5)])),
      band: { lo: r.band.lo.map(round5), hi: r.band.hi.map(round5) },
    }
  }
  return { ...model, ranks }
}
