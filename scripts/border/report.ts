/**
 * 答え合わせのレポート（純粋関数）。予測ログを実測の終値で採点する。
 * analyze.ts は import しただけで解析ジョブ全体が走るので、テストする関数はこちらに置く
 */
import type { ModelSummary } from '../../workers/border/src/fit.ts'
import { RANKS, durationHours, type EventMeta } from '../../workers/border/src/model.ts'
import type { ResultRank } from '../../workers/border/src/posts.ts'
import type { ResultPostRank } from '../../workers/border/src/snapshot.ts'

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

/**
 * 採点する時点（経過率）。各時点で「経過がその時点以上の最初の予測」を使う（どの時点も同じ決まり）。
 * Worker が節目（経過50%・85%）の投稿に使うのも、節目を越えた最初の値（collect.ts の MILESTONES: 前の値 < 節目 ≤ この値）。
 * 同じ行を選べば、答え合わせ（X とサイト）の予測が投稿した予測と同じ値になる（投稿があるのは 50%・85% だけ。70%・95% は同じ決まりで選ぶだけ）。
 * 2026-11-09 まで「progress ≤ 時点 + 0.005 の最新」を使っていて、予測が30分ごとなので長い回（30分＝経過0.2〜0.3%）では
 * 投稿の次の行を選び、219・220・223 で投稿と答え合わせの値がずれた（経過50%・85% とも）
 * ★ 投稿は全順位の最新の取得時刻（snapshot の progress）で節目を判定し、予測ログの progress は順位ごとの取得時刻で出す。
 *   ある順位の取得時刻だけが遅れて節目の手前に残ると、その順位は1行後を選ぶ（直す前の決まりでも起きる。219〜223 では起きていない）
 */
export const REPORT_CHECKPOINTS = [0.5, 0.7, 0.85, 0.95] as const
/** 時点を越えた最初の予測が、時点よりこれ以上後なら「その時点の予測は無かった」とする（止まっていた回など） */
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
    // 経過が数でない行は使わない（文字列は比べると数に化けて「越えた」に入る）
    const mine = preds.filter((p) => p.rank === rank && typeof p.progress === 'number' && Number.isFinite(p.progress)).sort((a, b) => a.ts - b.ts)
    const prospective: ProspectiveScore[] = []
    for (const c of REPORT_CHECKPOINTS) {
      const p = mine.find((x) => x.progress >= c)
      if (!p || p.progress - c > MAX_STALENESS) continue
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

/**
 * 答え合わせの代表の値（X の答え合わせの投稿と、その payload。サイトの答え合わせ欄は保存したレポートの checkpoint 0.85 を読む）。
 * 経過85% の予測を使う。buildReport が節目を越えた最初の予測を選ぶので、開催中に投稿した経過85% の予測と同じ値になる
 */
export function resultRanks(report: Report): (ResultRank & ResultPostRank)[] {
  const out: (ResultRank & ResultPostRank)[] = []
  for (const r of report.ranks) {
    const at = r.prospective.find((x) => x.checkpoint === 0.85) ?? r.prospective[r.prospective.length - 1]
    if (!at || !at.visible) continue
    out.push({ rank: r.rank, final: r.final, predicted: at.predicted, progress: at.progress, error: at.error, inBand: at.inBand, low: at.low, high: at.high })
  }
  return out
}
