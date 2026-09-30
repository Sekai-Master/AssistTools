/**
 * 推移のグラフ用の整形（純粋関数）。
 *
 * 元データは /api/border/events/{id}/history（Worker が30分ごとに1行ずつ足す）。
 * 行: [sampleAt, progress, [[rank, current, predicted, low, high, visible], ...]]
 */

export interface HistoryPoint {
  t: number;
  progress: number;
  current: number;
  /** その時点で**出していた**予測だけ（出していなければ null。画面の表と同じ扱い） */
  predicted: number | null;
  low: number | null;
  high: number | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

/** 順位 → 時刻順の点。壊れた行・欄は捨てる。 */
export function parseHistory(raw: unknown): Map<number, HistoryPoint[]> {
  const out = new Map<number, HistoryPoint[]>();
  const rows = raw && typeof raw === "object" ? (raw as { rows?: unknown }).rows : undefined;
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!Array.isArray(row) || !isNum(row[0]) || !isNum(row[1]) || !Array.isArray(row[2])) continue;
    const [t, progress, ranks] = row as [number, number, unknown[]];
    for (const r of ranks) {
      if (!Array.isArray(r) || !isNum(r[0]) || !isNum(r[1])) continue;
      const shown = r[5] === 1;
      const point: HistoryPoint = {
        t,
        progress,
        current: r[1],
        predicted: shown ? numOrNull(r[2]) : null,
        low: shown ? numOrNull(r[3]) : null,
        high: shown ? numOrNull(r[4]) : null,
      };
      out.set(r[0], [...(out.get(r[0]) ?? []), point]);
    }
  }
  for (const [rank, pts] of out) out.set(rank, [...pts].sort((a, b) => a.t - b.t));
  return out;
}

/** 予測を出していた点（予測・幅がそろっている） */
export type ShownPoint = HistoryPoint & { predicted: number; low: number; high: number };

export const isShown = (p: HistoryPoint): p is ShownPoint => p.predicted != null && p.low != null && p.high != null;

/** 予測を出していた点が続く区間ごとに分ける（出していない所で線や帯をつながない） */
export function shownRuns(points: readonly HistoryPoint[]): ShownPoint[][] {
  const runs: ShownPoint[][] = [];
  let run: ShownPoint[] = [];
  for (const p of points) {
    if (isShown(p)) {
      run = [...run, p];
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** 切りのいい上端の刻み（先頭の数字）と、そのときの目盛りの割り方 */
const NICE: readonly { f: number; parts: number }[] = [
  { f: 1, parts: 4 },
  { f: 2, parts: 4 },
  { f: 2.5, parts: 5 },
  { f: 5, parts: 5 },
  { f: 10, parts: 5 },
];

function niceOf(v: number): { top: number; parts: number } {
  if (!(v > 0)) return { top: 1, parts: 4 };
  const base = 10 ** Math.floor(Math.log10(v));
  const n = NICE.find((x) => x.f * base >= v) ?? NICE[NICE.length - 1];
  return { top: n.f * base, parts: n.parts };
}

/** 縦軸の上端を 1・2・2.5・5 × 10^k に切り上げる */
export function niceCeil(v: number): number {
  return niceOf(v).top;
}

/** 0 から上端までの目盛り（上端の先頭の数字に合わせて4つか5つに割る） */
export function yTicks(top: number): number[] {
  const { parts } = niceOf(top);
  return Array.from({ length: parts + 1 }, (_, i) => (top * i) / parts);
}

/** 縦軸の上端: 実測と、出していた予測の幅の上端まで入るように */
export function yTop(points: readonly HistoryPoint[]): number {
  const max = points.reduce((m, p) => Math.max(m, p.current, p.high ?? 0, p.predicted ?? 0), 0);
  return niceCeil(max);
}

const HOUR = 3_600_000;
const JST = 9 * HOUR;
const DAY = 24 * HOUR;

/**
 * 横軸の右端。最初からイベント全体（246時間など）を取ると、序盤は線が左端に潰れて読めない。
 * 「開始から最新＋その3割（最低6時間）」まで、ただし最低24時間・最大で終了まで。時間が経つと自然に全体へ広がる。
 */
export function visibleEnd(startAt: number, endAt: number, lastT: number): number {
  const elapsed = Math.max(0, lastT - startAt);
  return Math.min(endAt, Math.max(startAt + DAY, lastT + Math.max(6 * HOUR, elapsed * 0.3)));
}

/** 目盛りの間隔の候補（短い順）。日本時間にそろえる */
const TICK_STEPS = [3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 3 * DAY];

/**
 * 横軸の目盛り。ラベルが maxLabels 以下になる一番細かい間隔を選び、日本時間にそろえて置く。
 * 0時は「10/1」、それ以外は「6時」のように書く。
 */
export function timeTicks(from: number, to: number, maxLabels: number): { t: number; label: string }[] {
  const span = Math.max(1, to - from);
  const step = TICK_STEPS.find((s) => span / s <= Math.max(1, maxLabels)) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const first = Math.ceil((from + JST) / step) * step - JST;
  const out: { t: number; label: string }[] = [];
  for (let t = first; t <= to; t += step) {
    const d = new Date(t + JST);
    const h = d.getUTCHours();
    out.push({ t, label: h === 0 ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : `${h}時` });
  }
  return out;
}
