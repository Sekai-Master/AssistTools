/**
 * ボーダー予測ページの表示用の整形（純粋関数）。API の形は Worker 側と同じ型を使う。
 */
import type { ModelSummary } from "../../../workers/border/src/fit";
import { CANDIDATE_LABEL, type Confidence } from "../../../workers/border/src/model";
import type { Snapshot } from "../../../workers/border/src/snapshot";
import type { Report } from "../../../scripts/border/report";

export type { ModelSummary, Report, Snapshot };

export interface TrackRecord {
  model: ModelSummary | null;
  reports: Report[];
}

/** sekai.best の取得がこれ以上止まっていたら注意を出す（2026-09-10 に3.4時間止まった） */
export const STALE_AFTER_MS = 90 * 60_000;

/** 答え合わせで代表に使う時点（開催中の「終盤」ポストと同じ） */
export const RECORD_CHECKPOINT = 0.85;

export function formatJst(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatPercent(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function signedPercent(x: number): string {
  const v = (x * 100).toFixed(1);
  return x > 0 ? `+${v}%` : `${v}%`;
}

export type EventPhase = "running" | "finished";

export function phaseOf(s: Snapshot, now: number): EventPhase {
  return now <= s.event.aggregateAt + 60_000 ? "running" : "finished";
}

export function isStale(s: Snapshot, now: number): boolean {
  return phaseOf(s, now) === "running" && now - s.sampleAt > STALE_AFTER_MS;
}

export interface RankView {
  rank: number;
  current: number;
  predicted: number | null;
  low: number | null;
  high: number | null;
  /** 確度（高・中・目安）。古い版の Worker が書いたスナップショットには無いので任意 */
  confidence?: Confidence | null;
  visible: boolean;
  /** 表に出し始める経過率（モデルから） */
  showFrom: number | null;
}

/**
 * 予測を出していない順位に添える一言。
 * showFrom が 1 を超えるのは「この順位はどの時点でも出さない」印（モデル側の約束）なので、経過率として読まない
 */
export function hiddenReason(r: Pick<RankView, "showFrom">, progress: number): string {
  if (r.showFrom != null && r.showFrom <= 1 && progress < r.showFrom) return `予測は経過${formatPercent(r.showFrom)}から出します`;
  return "外れ幅が大きすぎるので、いまは予測を出していません";
}

export function rankViews(s: Snapshot, model: ModelSummary | null): RankView[] {
  return s.ranks.map((r) => ({
    ...r,
    showFrom: model?.ranks.find((m) => m.rank === r.rank)?.minProgress ?? null,
  }));
}

export interface RecordRow {
  rank: number;
  final: number;
  /** 本番の予測（その時点で実際に出していたもの） */
  predicted: number | null;
  progress: number | null;
  error: number | null;
  inBand: boolean | null;
  /** 本番の予測が無い回は、その時点までのデータだけで作ったモデルの再現誤差を出す */
  replayError: number | null;
}

export function recordRows(report: Report): RecordRow[] {
  return report.ranks.map((r) => {
    const at =
      r.prospective.find((p) => p.checkpoint === RECORD_CHECKPOINT) ??
      r.prospective[r.prospective.length - 1] ??
      null;
    const replay = r.replay?.find((x) => Math.abs(x.p - 0.9) < 1e-9)?.error ?? null;
    return {
      rank: r.rank,
      final: r.final,
      predicted: at?.predicted ?? null,
      progress: at?.progress ?? null,
      error: at?.error ?? null,
      inBand: at?.inBand ?? null,
      replayError: replay,
    };
  });
}

export function candidateLabel(id: string): string {
  return (CANDIDATE_LABEL as Record<string, string>)[id] ?? id;
}

/** 帯の当たり率（序盤と中盤以降の全チェックポイントの合算。序盤は新しい版のモデルにしか無い） */
export function coverageRate(r: ModelSummary["ranks"][number]): { covered: number; total: number } {
  return [...r.coverage, ...(r.coverageEarly ?? [])].reduce(
    (a, c) => ({ covered: a.covered + c.covered, total: a.total + c.total }),
    { covered: 0, total: 0 },
  );
}
