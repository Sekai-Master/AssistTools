import { SCORE_STEP } from "./constants";

/**
 * ライブボーナスの消費量ごとのイベントポイント倍率。
 *
 * マスタDB boosts.json の costBoost -> eventPointRate と全域で一致することを確認済み。
 * https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/boosts.json
 *
 * 注意: 大手攻略サイトは 2024-09-28 の改定（4→20, 5→25, 6→27）に追従できておらず
 * 古い値（4→19, 5→23, 6→26）を掲載している。検証する際はマスタDBを一次情報とすること。
 */
export const LIVE_BONUS_MULTIPLIERS: Record<number, number> = {
  0: 1,
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 25,
  6: 27,
  7: 29,
  8: 31,
  9: 33,
  10: 35,
};

/**
 * ひとりでライブでの獲得イベントポイント。
 *
 *   スコア係数 = floor(スコア / 20000)
 *   val2       = (スコア係数 + 100) * (ボーナス + 100) / 100
 *   step2      = floor(val2 * 10) / 10          ← 小数第1位まで保持
 *   獲得Pt     = floor(step2 * 基礎点 / 100) * ライブボーナス倍率
 *
 * 「小数第1位まで保持」は二次情報が割れていた論点。base=100 では3方式が
 * 数学的に同値になるためエンヴィー基準では判別できず、base=114 の曲を
 * スコア 1,224,240（val2=830.76）で実測して 946 を得て確定させた
 * （第2位保持なら947になる条件）。
 *
 * 実装上は割り算を最後まで遅らせて整数で処理する。素朴に書くと
 * base=125 で `258.4 * 125` が `32299.999999999996` になり、切り捨てが1つ余分に走る。
 */
export function calcLivePt(
  base: number,
  bonus: number,
  score: number,
  liveBonusVal: number
): number {
  const step1 = Math.floor(score / SCORE_STEP);

  // ボーナスは 0.5% 刻みを取りうるので 100 倍して整数化する
  const bonus100x = Math.round(bonus * 100);
  const numerator = (step1 + 100) * (bonus100x + 10000); // = val2 * 10000
  const step2x10 = Math.floor(numerator / 1000); // = floor(val2 * 10)
  const step3 = Math.floor((step2x10 * base) / 1000); // = floor(step2 * base / 100)

  const multiplier = LIVE_BONUS_MULTIPLIERS[liveBonusVal] || 1;
  return step3 * multiplier;
}
