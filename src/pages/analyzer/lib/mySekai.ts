import {
  LIVE_ADJUST_RESERVE,
  MEMORY_A_10X,
  MEMORY_B_10X,
  MEMORY_C_10X,
  MYSEKAI_MULTIPLIER,
  MYSEKAI_MULTIPLIER_WORLD_PASS,
  TALENT_COEF_DIVISOR,
} from "./constants";

/**
 * マイセカイの採取配分。
 *
 * 単価の式は実機で計測して確定済み。
 *   総合力 297,159 / ボーナス 615% → 1100 Pt
 *   総合力 313,460 / ボーナス 416% →  800 Pt
 * メモリ値（木石=1.0 / キラキラ=0.5 / 草花=0.2）も同時に確認している。
 *
 * ## スコープ外（意図的に扱わないもの）
 *
 * - **誕生日植物（2.5メモリ）**: マスタDB上は存在するが、この関数は「目標に当てるため
 *   何個採ればよいか」を出す planning ツール。木/キラキラ/草花は毎日実質無制限に採れる
 *   分母だが、誕生日植物はキャラ誕生日周辺の限定・少量なので、無制限の分母として最適化に
 *   混ぜると「誕生日植物を大量に採れ」という物理的に不可能な提案になる。よって分母に含めない。
 * - **1日あたりのスタミナ上限**: 同じ理由で、採取量に上限がある点はこの最適化では無視して
 *   いる（残り日数を入力に取っていないため、上限を正しくモデル化できない）。終盤に「採りきれ
 *   ない量」を提示しうる点は UI 側の注記で補う。
 */

export interface MySekaiAllocation {
  /** 木・石（1.0メモリ） */
  countA: number;
  /** キラキラ・樽（0.5メモリ） */
  countB: number;
  /** 草花・工具箱・宝箱（0.2メモリ） */
  countC: number;
  totalPt: number;
}

export const EMPTY_ALLOCATION: MySekaiAllocation = {
  countA: 0,
  countB: 0,
  countC: 0,
  totalPt: 0,
};

/** メモリ1つあたりの獲得ポイント。 */
export function calculateUnitBasePt(
  talent: number,
  bonus: number,
  hasWorldPass: boolean
): number {
  const coefTalent = Math.floor((1 + talent / TALENT_COEF_DIVISOR) * 10) / 10;
  const baseVal = Math.floor(coefTalent * (1 + bonus / 100));
  const multiplier = hasWorldPass ? MYSEKAI_MULTIPLIER_WORLD_PASS : MYSEKAI_MULTIPLIER;
  return baseVal * multiplier;
}

/**
 * 埋めるべき差分に対して、マイセカイの採取物を最大限割り当てる。
 * ライブ端数調整のために最低 LIVE_ADJUST_RESERVE Pt を残す。
 *
 * 配分できない条件（差分が小さい / 単価が0）のときは何も採らない。
 * 単価0のガードは無限ループ防止も兼ねている。0 だと capacity が Infinity になり、
 * `for (let a = Infinity; a >= Math.max(0, Infinity - 1); a--)` の条件が
 * `Infinity - 1 === Infinity` により永久に真になる。
 */
export function allocateMySekai(adjustableDiff: number, unitBasePt: number): MySekaiAllocation {
  if (!(adjustableDiff > LIVE_ADJUST_RESERVE && unitBasePt > 0)) {
    return { ...EMPTY_ALLOCATION };
  }

  // Capacity in 0.1 units
  const capacity = Math.floor(((adjustableDiff - LIVE_ADJUST_RESERVE) * 10) / unitBasePt);

  let bestTotalVal = -1;
  let bestA = 0;
  let bestB = 0;
  let bestC = 0;

  // A (Tree/Rock) = 10 units (of 0.1)
  const maxA = Math.floor(capacity / MEMORY_A_10X);
  // Check max and max-1
  for (let a = maxA; a >= Math.max(0, maxA - 1); a--) {
    const remA = capacity - a * MEMORY_A_10X;

    // B (Glitter) = 5 units
    const maxB = Math.floor(remA / MEMORY_B_10X);
    // Check max and max-1
    for (let b = maxB; b >= Math.max(0, maxB - 1); b--) {
      const remB = remA - b * MEMORY_B_10X;

      // C (Flower) = 2 units
      const c = Math.floor(remB / MEMORY_C_10X);

      const currentTotalVal = a * MEMORY_A_10X + b * MEMORY_B_10X + c * MEMORY_C_10X;

      if (currentTotalVal > bestTotalVal) {
        bestTotalVal = currentTotalVal;
        bestA = a;
        bestB = b;
        bestC = c;
      }
    }
  }

  return {
    countA: bestA,
    countB: bestB,
    countC: bestC,
    totalPt: Math.floor((bestTotalVal * unitBasePt) / 10),
  };
}

/** 配分が実行されたか（ログの出し分けに使う。totalPt===0 では判定できない）。 */
export function isAllocationAttempted(adjustableDiff: number, unitBasePt: number): boolean {
  return adjustableDiff > LIVE_ADJUST_RESERVE && unitBasePt > 0;
}
