import { BONUS_STEP_10X, MAX_LIVE_BONUS, MAX_SEARCH_BONUS_10X } from "./constants";
import { type ScorePlan, collectScorePlans } from "./scoreSearch";

/**
 * ラストランのプラン列挙。
 *
 * 「締めの1回でちょうど N ポイント取る」ための (ボーナス, 消費ライブボーナス, スコア帯) を
 * すべて挙げる。探索の実体は scoreSearch.ts に集約済み。
 *
 * **push 順を変えないこと。** UI の推奨プラン選定はこの配列の順序に依存しており、
 * 比較関数が同値を返したときの並びが変わると提示されるプランが変わる。
 * ここはボーナス外側・ライブボーナス0〜10・倍率での枝刈りあり。
 */

export type FinalRunPlan = ScorePlan;

const ALL_LIVE_BONUSES = Array.from({ length: MAX_LIVE_BONUS + 1 }, (_, i) => i);

/** 探索するボーナス上限（10倍整数）。ユーザーの現在ボーナスで頭を抑える。 */
function searchedMaxBonus10x(bonus: number): number {
  // 以前は 435% のハードコードだったが、ワールドリンク開催中は
  // サポートデッキ分が乗って実効ボーナスが 700% 超になるため取りこぼしていた。
  // 逆にユーザーが自分の編成より高いボーナスを出すことはできない。
  return Math.min(Math.max(0, Math.floor(bonus * 10)), MAX_SEARCH_BONUS_10X);
}

export function planFinalRun(
  finalRunPt: number,
  base: number,
  bonus: number
): FinalRunPlan[] {
  if (finalRunPt <= 0) return [];

  return collectScorePlans({
    base,
    target: finalRunPt,
    liveBonuses: ALL_LIVE_BONUSES,
    bonusMax10x: searchedMaxBonus10x(bonus),
    bonusStep10x: BONUS_STEP_10X,
    bonusOuter: true,
    pruneByMultiplier: true,
  });
}

/** 探索に使ったボーナス上限（%）。エラー文言に出す。 */
export function finalRunSearchedMaxBonus(bonus: number): number {
  return searchedMaxBonus10x(bonus) / 10;
}
