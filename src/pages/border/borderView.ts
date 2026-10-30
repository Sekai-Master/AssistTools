/**
 * ボーダー予測ページの表示用の整形（純粋関数）。API の形は Worker 側と同じ型を使う。
 */
import type { ModelSummary } from "../../../workers/border/src/fit";
import { CANDIDATE_LABEL, eventEndMs, type Confidence } from "../../../workers/border/src/model";
import { referenceOf, type Snapshot } from "../../../workers/border/src/snapshot";
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

/**
 * 参考値の説明（「この回の予測は参考値です。」の後ろの文）。参考値でなければ null。
 * 表の出どころ（referenceOf）で書き分ける（#175、2026-10-30）:
 *   thin   … 同じ長さの回が少ない。直近の回とほかの回の伸び方を混ぜた比率を、版の weight から書く
 *            （日程のわかっている回は率モデルの表も混ざるので「ほかの長さの回」でなく「ほかの回」）
 *   rate   … 過去に無い長さ。いちばん近い長さの回の伸び方と、全イベントから作った形（率モデル）を混ぜている
 *   borrow … 過去に無い長さ。いちばん近い長さの回の伸び方をそのまま借りている（率モデルの無い版・日程のわからない回）
 */
export function referenceDetail(s: Pick<Snapshot, "event" | "extrapolatedFrom" | "thin" | "referenceSource">): string | null {
  const source = referenceOf(s);
  if (source == null) return null;
  const hours = s.event.durationHours;
  if (source === "thin" && s.thin) {
    const same = Math.round(s.thin.weight * 10);
    return `このイベントは ${hours} 時間で、過去に同じ長さの回が ${s.thin.samples} 回しかありません。同じ長さの直近の回（第${s.thin.latestEventId}回）の伸び方を${same}割、ほかの回の伸び方を${10 - same}割で混ぜて出しているので、大きく外れることがあります`;
  }
  const how =
    source === "rate"
      ? `いちばん近い ${s.extrapolatedFrom} 時間の回の伸び方と、これまでの全イベントの伸び方から作った形を混ぜて出しているので`
      : `いちばん近い ${s.extrapolatedFrom} 時間の回の伸び方を借りて出しているので`;
  return `このイベントは ${hours} 時間で、過去に同じ長さの回がありません。${how}、大きく外れることがあります`;
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

/** 経過率が p になる時刻（model.ts の progressAt の逆） */
export function timeAtProgress(e: Pick<Snapshot["event"], "startAt" | "aggregateAt">, p: number): number {
  return e.startAt + p * (eventEndMs(e) - e.startAt);
}

/**
 * 予測を出していない順位に添える一言。event を渡すと、出し始める時刻も添える
 * （経過4% は150時間の回なら約6時間、246時間の回なら約10時間と、長さで変わるため）。
 * showFrom が 1 を超えるのは「この順位はどの時点でも出さない」印（モデル側の約束）なので、経過率として読まない。
 * showFrom が無い（モデルがまだ無い）ときは理由を決めつけない。
 */
export function hiddenReason(
  r: Pick<RankView, "showFrom">,
  progress: number,
  event?: Pick<Snapshot["event"], "startAt" | "aggregateAt">,
): string {
  if (r.showFrom == null) return "予測はまだ出していません";
  if (r.showFrom <= 1 && progress < r.showFrom) {
    const when = event ? `（${formatJst(timeAtProgress(event, r.showFrom))}ごろ）` : "";
    return `予測は経過${formatPercent(r.showFrom)}${when}から出します`;
  }
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
