import {
  BONUS_STEP_10X,
  DEFAULT_MAX_SCORE_N,
  MAX_SEARCH_BONUS_10X,
  SCORE_STEP,
} from "./constants";
import { calcLivePt } from "./calcLivePt";
import {
  MAX_REPS_PER_PT,
  type MultiLiveAdjustResult,
  type ReachablePtTable,
  type Rep,
  planFromReachablePtTable,
} from "./multiLiveAdjust";

/**
 * モードA（曲固定・ボーナス可変・複数回）の到達可能Pt表と着地探索（R6 §1-2）。
 *
 * ## なぜ新モジュールなのか
 *
 * モードB（曲可変・現ボーナス固定）の buildReachablePtTable は「基礎点」を掃引軸に
 * するが、モードAは「曲を固定してボーナスをいじる」ので掃引軸がボーナスになる。
 * frontier構築・best選択（planFromReachablePtTable）は完全に共有し、**表の作り方だけ**
 * を差し替える。掃引ループ本体・探索クラスは1行も変えていない（禁じ手回避）。
 *
 * ## 「1プレイで端数を当てる」前提の撤廃（依頼者フィードバック②）
 *
 * 従来のモードA（liveAdjust.ts の単発掃引）は1本の上限（基礎点100・LB10・スコア上限で
 * 約59,115）を超える残額（例 79,361）を原理的に着地できなかった。ここで
 * planFromReachablePtTable に載せることで「N回叩いて合計で当てる」複数回化を得る。
 */

/**
 * ボーナス列を作る（生ボーナス ＋ 0〜現ボーナスの BONUS_STEP_10X 刻みグリッド）。
 *
 * - **生 bonus を先頭**に置く: 同一Ptなら「編成そのまま」の rep が先に記憶され、
 *   frontier の reps.get(pt)[0]（＝最安手段）で優先される（R6 §1-2）。
 * - グリッド上限 = liveAdjust.ts:107 と同一式。組み替えは現ボーナス以下のみ、という
 *   既存前提（編成を弱める方向にしか動かさない）を踏襲する。
 * - グリッドが生 bonus と重複する場合は dedupe。
 */
function bonusColumn(bonus: number): number[] {
  const maxBonus10x = Math.min(Math.max(0, Math.floor(bonus * 10)), MAX_SEARCH_BONUS_10X);
  const seen = new Set<number>();
  const col: number[] = [];
  col.push(bonus); // 生 bonus を列の先頭に
  seen.add(bonus);
  for (let b10x = 0; b10x <= maxBonus10x; b10x += BONUS_STEP_10X) {
    const b = b10x / 10;
    if (!seen.has(b)) {
      seen.add(b);
      col.push(b);
    }
  }
  return col;
}

/**
 * モードA用の到達可能Pt表。buildReachablePtTable の鏡（bases をボーナス列に差し替え）。
 *
 * LB を外側の昇順ループにするのは buildReachablePtTable と同じ理由:
 * 「各Ptの先頭要素＝最もLB消費の安い手段」という不変条件を保つため
 * （planFromReachablePtTable が reps.get(pt)[0] で最安LBを引く）。
 * reps.set / push の手順もコピーではなく同一手順で書く（表の作り方の一貫性）。
 */
export function buildBonusSweepTable(
  base: number,
  bonus: number,
  liveBonuses: readonly number[],
  maxScoreN: number = DEFAULT_MAX_SCORE_N
): ReachablePtTable {
  const bonuses = bonusColumn(bonus);
  const sortedLb = [...liveBonuses].sort((a, b) => a - b);
  const reps = new Map<number, Rep[]>();
  for (const lb of sortedLb) {
    for (const b of bonuses) {
      for (let n = 0; n <= maxScoreN; n++) {
        const pt = calcLivePt(base, b, n * SCORE_STEP, lb);
        if (pt <= 0) continue;
        const list = reps.get(pt);
        if (!list) {
          reps.set(pt, [{ basePoint: base, liveBonus: lb, scoreN: n, bonus: b }]);
        } else if (list.length < MAX_REPS_PER_PT) {
          list.push({ basePoint: base, liveBonus: lb, scoreN: n, bonus: b });
        }
      }
    }
  }
  const sortedPts = [...reps.keys()].sort((a, b) => b - a);
  const maxPtPerLive = sortedPts.length > 0 ? sortedPts[0] : 0;
  const minPtPerLive = sortedPts.length > 0 ? sortedPts[sortedPts.length - 1] : 0;
  // basesCount は「基礎点の異なり数」の意味だがモードAは曲固定なので常に1。
  return { reps, sortedPts, maxPtPerLive, minPtPerLive, basesCount: 1, maxScoreN };
}

/**
 * モジュール内1スロットのメモ化キャッシュ。
 *
 * scoreZero（§3）が finalRunPt だけ変えてパイプラインを最大11回回すため、同一
 * (base, bonus, liveBonuses, maxScoreN) の表を毎回作り直すのがボトルネックになる。
 * 純関数の結果キャッシュであり出力は不変（liveRequired に依存しない表）。
 */
let cache: { key: string; table: ReachablePtTable } | null = null;

function bonusSweepTableMemo(
  base: number,
  bonus: number,
  liveBonuses: readonly number[],
  maxScoreN: number
): ReachablePtTable {
  const key = `${base}|${bonus}|${maxScoreN}|${[...liveBonuses].join(",")}`;
  if (cache && cache.key === key) return cache.table;
  const table = buildBonusSweepTable(base, bonus, liveBonuses, maxScoreN);
  cache = { key, table };
  return table;
}

/**
 * モードA（曲固定・ボーナス可変・複数回）の着地探索。
 * 表をメモ化して planFromReachablePtTable に渡すだけの薄いラッパ。
 */
export function planModeAMulti(
  liveRequired: number,
  base: number,
  bonus: number,
  liveBonuses: readonly number[],
  maxScoreN: number = DEFAULT_MAX_SCORE_N
): MultiLiveAdjustResult {
  const table = bonusSweepTableMemo(base, bonus, liveBonuses, maxScoreN);
  return planFromReachablePtTable(liveRequired, table);
}
