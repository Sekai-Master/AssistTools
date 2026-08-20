import { MULTI_OTHER_SCORE_CAP, SCORE_STEP } from "./constants";

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
  return livePtFromCoefficient(soloScoreCoefficient(score), base, bonus, liveBonusVal);
}

/**
 * スコア係数（＝上式の「スコア係数 + 100」に当たる整数）から獲得ポイントを出す共通部。
 *
 * 丸めの作法（小数第1位保持）はライブ種別によらず同じで、違うのは係数の作り方だけ。
 * 実測で確定させたこの丸めを種別ごとに書き写すと必ず片方だけ古くなるので、
 * 係数を差し替える口だけ開けて本体は1つに保つ。
 */
export function livePtFromCoefficient(
  coefficient: number,
  base: number,
  bonus: number,
  liveBonusVal: number
): number {
  // ボーナスは 0.5% 刻みを取りうるので 100 倍して整数化する
  const bonus100x = Math.round(bonus * 100);
  const numerator = coefficient * (bonus100x + 10000); // = val2 * 10000
  const step2x10 = Math.floor(numerator / 1000); // = floor(val2 * 10)
  const step3 = Math.floor((step2x10 * base) / 1000); // = floor(step2 * base / 100)

  const multiplier = LIVE_BONUS_MULTIPLIERS[liveBonusVal] || 1;
  return step3 * multiplier;
}

/** ひとりでライブ／オートのスコア係数。 */
export function soloScoreCoefficient(score: number): number {
  return 100 + Math.floor(score / SCORE_STEP);
}

/**
 * 協力ライブ（みんなでライブ）のスコア係数。ソロとは式そのものが違う。
 *
 *   110 + floor(自分のスコア / 17000) + min(16, floor(他4人の合計スコア / 340000))
 *
 * 他4人ぶんが式に入るのが要点で、これが「支援を厚くすると単価が上がる」の正体。
 * 上限16に張り付くのは他4人合計が544万点からなので、同格の部屋ならすぐ飽和する（2026-08-21 に実機で確認）。
 * 他人のスコアが分からないときは参照実装（xfl03/sekai-calculator）に合わせて
 * 自分と同じ実力の4人＝自分のスコア×4 で置く。
 */
export function multiScoreCoefficient(selfScore: number, otherScore?: number): number {
  const other = otherScore != null && otherScore > 0 ? otherScore : 4 * selfScore;
  return (
    110 + Math.floor(selfScore / 17000) + Math.min(MULTI_OTHER_SCORE_CAP, Math.floor(other / 340000))
  );
}

/** 協力ライブでの獲得イベントポイント。丸めは calcLivePt と共通、係数だけ協力用。 */
export function calcMultiLivePt(
  base: number,
  bonus: number,
  selfScore: number,
  liveBonusVal: number,
  otherScore?: number
): number {
  return livePtFromCoefficient(
    multiScoreCoefficient(selfScore, otherScore),
    base,
    bonus,
    liveBonusVal
  );
}

/**
 * 「1LBあたり倍率」が最大となる最大の焚き数（P2-8のハードコード解消）。
 *
 * 2024-09-28 改定前は3焚き（15/3=5.00）を境に効率が下がったため「3焚きまで」が
 * 定石だったが、改定後は4焚き（20/4=5.00）・5焚き（25/5=5.00）まで効率が横ばいで、
 * 6焚き（27/6=4.50）から下がる。この「横ばいの終わり」を LIVE_BONUS_MULTIPLIERS
 * から機械的に導出する。表が将来また改定されても、UIの文言はここを経由する限り
 * 追随する（弱点7と同型の「3焚き/5焚きのハードコード」を再発させないための関数）。
 *
 * 0炊きは「1LBあたり」という概念に当てはまらない（消費0のため）ので除外する。
 * 複数の焚き数が同じ最大効率で並ぶ場合、その中で最大の焚き数を返す
 * （「その効率のまま伸ばせる限界」を示すのが本関数の目的のため）。
 *
 * 浮動小数点誤差対策: 倍率は整数だが割り算で比較するため、極小の差は
 * 同値とみなす（このテーブルの値では実害はないが、将来の改定で割り切れない
 * 倍率が入っても壊れないようにする防御）。
 */
export function maxEfficientLiveBonus(
  multipliers: Readonly<Record<number, number>> = LIVE_BONUS_MULTIPLIERS
): number {
  const lbValues = Object.keys(multipliers)
    .map(Number)
    .filter((lb) => lb > 0)
    .sort((a, b) => a - b);
  if (lbValues.length === 0) return 0;

  const EPSILON = 1e-9;
  let maxEfficiency = -Infinity;
  for (const lb of lbValues) {
    const efficiency = multipliers[lb] / lb;
    if (efficiency > maxEfficiency) maxEfficiency = efficiency;
  }

  let result = lbValues[0];
  for (const lb of lbValues) {
    // 昇順走査なので、最大効率に並ぶ最後（＝最大）の焚き数が残る。
    const efficiency = multipliers[lb] / lb;
    if (Math.abs(efficiency - maxEfficiency) < EPSILON) result = lb;
  }
  return result;
}
