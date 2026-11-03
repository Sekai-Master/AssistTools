import { HISTORY_RANKS, type HistoryRank } from "./historyView";

/**
 * 歴代ボーダーの推移のグラフ用の整形（純粋関数）。
 *
 * 元データは /api/border/events/{id}/shape（D1 の shapes 表。解析ジョブが終わった回ごとに書く）。
 * 形は「経過率 0%〜100% を 2% 刻みにした 51 点での 値÷終値」（workers/border/src/model.ts の GRID）。欠測は null。
 * 値＝割合×終値、横軸は経過時間＝経過率×その回の時間。
 */

/** 格子の点の数（0%〜100% の 2% 刻み）。model.ts の GRID と同じ（historyShape.test.ts で照合） */
export const SHAPE_POINTS = 51;

export interface ShapeSeries {
  rank: HistoryRank;
  final: number;
  /** 格子の各点の値（割合×終値）。欠測は null */
  values: (number | null)[];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 公開 API の応答を読む。知らない順位・形の合わない行は捨てる。順位は HISTORY_RANKS の順 */
export function parseShape(raw: unknown): ShapeSeries[] {
  const ranks = raw && typeof raw === "object" ? (raw as { ranks?: unknown }).ranks : undefined;
  if (!Array.isArray(ranks)) return [];
  const byRank = new Map<HistoryRank, ShapeSeries>();
  for (const r of ranks) {
    if (!r || typeof r !== "object") continue;
    const { rank, final, share } = r as { rank?: unknown; final?: unknown; share?: unknown };
    const key = HISTORY_RANKS.find((k) => Number(k) === rank);
    if (!key || !finite(final) || !(final > 0) || !Array.isArray(share) || share.length !== SHAPE_POINTS) continue;
    if (!share.every((v) => v === null || finite(v))) continue;
    byRank.set(key, { rank: key, final, values: share.map((v) => (v === null ? null : Math.round(v * final))) });
  }
  return HISTORY_RANKS.flatMap((k) => byRank.get(k) ?? []);
}

/** 格子の i 番目の経過時間（時間） */
export const hourAt = (i: number, hours: number): number => (i / (SHAPE_POINTS - 1)) * hours;

export interface ShapePoint {
  i: number;
  v: number;
}

/** 欠測の点で線を切った区間ごとの点（1点だけの区間も返す。描く側で点として描く） */
export function runsOf(values: readonly (number | null)[]): ShapePoint[][] {
  const runs: ShapePoint[][] = [];
  let run: ShapePoint[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run = [...run, { i, v }];
    }
  });
  if (run.length > 0) runs.push(run);
  return runs;
}

/**
 * 出している順位に合わせた軸の範囲。縦は最大値（切りのいい上端は描く側で niceCeil）、
 * 横は最後に値のある点まで（終盤まで欠測している回で、右に空白を作らない）。
 */
export function extentOf(series: readonly ShapeSeries[], hours: number): { maxValue: number; xEnd: number } {
  let maxValue = 0;
  let lastI = 0;
  for (const s of series) {
    s.values.forEach((v, i) => {
      if (v == null) return;
      maxValue = Math.max(maxValue, v);
      lastI = Math.max(lastI, i);
    });
  }
  return { maxValue, xEnd: lastI > 0 ? hourAt(lastI, hours) : hours };
}

/** 横軸の目盛り（経過日数）。ラベルが maxLabels 以下になる一番細かい間隔（1・2・3・5日） */
export function dayTicks(xEnd: number, maxLabels: number): { h: number; label: string }[] {
  const days = xEnd / 24;
  const step = [1, 2, 3, 5].find((s) => days / s <= Math.max(1, maxLabels)) ?? 5;
  const out: { h: number; label: string }[] = [];
  for (let d = step; d * 24 <= xEnd + 1e-6; d += step) out.push({ h: d * 24, label: `${d}日` });
  return out;
}

/** 経過時間の書き方（ツールチップ）。「3日と6時間（経過 40%）」 */
export function elapsedLabel(i: number, hours: number): string {
  const h = Math.round(hourAt(i, hours));
  const d = Math.floor(h / 24);
  const rest = h % 24;
  const time = d === 0 ? `${rest}時間` : rest === 0 ? `${d}日` : `${d}日と${rest}時間`;
  return `${time}（経過 ${Math.round((i / (SHAPE_POINTS - 1)) * 100)}%）`;
}

/**
 * 縦軸の上端と目盛り。目盛りの間隔を 1・2・2.5・5 × 10^k から選び、上端は最大値を切り上げた間隔の倍数にする
 *（3〜6 本・上端が一番低いもの、同じなら本数が 5 に近いもの）。
 * ★ chartData.ts の niceCeil（上端を 1・2・2.5・5・10 × 10^k に）だと 5,314万 が 1億 になり、上半分が空く。
 *   ここは順位を外して縦軸を縮めるのが本題なので、上端を細かく取る。
 */
export function valueAxis(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const k = Math.floor(Math.log10(max));
  let best: { top: number; n: number; step: number } | null = null;
  for (const e of [k - 1, k]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * 10 ** e;
      const n = Math.ceil(max / step - 1e-9);
      if (n < 3 || n > 6) continue;
      const top = n * step;
      if (!best || top < best.top || (top === best.top && Math.abs(n - 5) < Math.abs(best.n - 5))) best = { top, n, step };
    }
  }
  if (!best) return { top: max, ticks: [0, max] };
  const { n, step } = best;
  return { top: best.top, ticks: Array.from({ length: n + 1 }, (_, i) => i * step) };
}
