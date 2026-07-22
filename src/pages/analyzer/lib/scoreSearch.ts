import { LIVE_BONUS_MULTIPLIERS, calcLivePt } from "./calcLivePt";
import { MAX_SCORE_N, SCORE_STEP } from "./constants";

/**
 * スコア帯の逆算（共通ルーチン）。
 *
 * 「基礎点 base・あるボーナス・ある消費ライブボーナスで叩いたとき、ちょうど target Pt に
 * なるスコア帯」を全探索で挙げる。finalRun.ts と liveAdjust.ts が同型の三重ループを
 * それぞれ手で持っていたのを1箇所に集約したもの。
 *
 * **push 順は呼び出し側の提示ロジックが依存している。** そのため
 * ループのネスト順（ボーナス外側 / ライブボーナス外側）を bonusOuter で選べるようにし、
 * 既存2箇所の並びを一字一句変えずに再現する。
 */

export interface ScorePlan {
  liveBonus: number;
  bonus: number;
  minScore: number;
  maxScore: number;
}

export interface ScoreSearchOptions {
  base: number;
  target: number;
  /** 消費を許すライブボーナスの候補（例: [0,1] や 0..10）。 */
  liveBonuses: readonly number[];
  /** 探索するボーナスの上限（10倍整数）。 */
  bonusMax10x: number;
  /** ボーナスの刻み（10倍整数）。 */
  bonusStep10x: number;
  /**
   * true: ボーナスを外側ループにする（finalRun の並び）。
   * false: ライブボーナスを外側ループにする（liveAdjust 5.2 の並び）。
   */
  bonusOuter: boolean;
  /**
   * true のとき、target が倍率で割り切れない消費数を N ループ前に枝刈りする。
   * 獲得Ptは必ず倍率の倍数になるので結果は不変（finalRun の枝刈りを再現）。
   */
  pruneByMultiplier?: boolean;
}

/** 固定の base/bonus/lb で target になる最初のスコア帯 N を返す。無ければ -1。 */
export function findScoreStep(
  base: number,
  bonus: number,
  liveBonus: number,
  target: number
): number {
  for (let n = 0; n <= MAX_SCORE_N; n++) {
    if (calcLivePt(base, bonus, n * SCORE_STEP, liveBonus) === target) return n;
  }
  return -1;
}

function planAt(liveBonus: number, bonus10x: number, n: number): ScorePlan {
  return {
    liveBonus,
    bonus: bonus10x / 10,
    minScore: n * SCORE_STEP,
    maxScore: (n + 1) * SCORE_STEP - 1,
  };
}

/**
 * target になる (ライブボーナス, ボーナス, スコア帯) の組み合わせをすべて挙げる。
 * bonusOuter でループのネスト順＝push順を選ぶ。
 */
export function collectScorePlans(opts: ScoreSearchOptions): ScorePlan[] {
  const { base, target, liveBonuses, bonusMax10x, bonusStep10x, bonusOuter, pruneByMultiplier } =
    opts;
  const plans: ScorePlan[] = [];

  const scan = (lb: number, b10: number) => {
    for (let n = 0; n <= MAX_SCORE_N; n++) {
      if (calcLivePt(base, b10 / 10, n * SCORE_STEP, lb) === target) {
        plans.push(planAt(lb, b10, n));
      }
    }
  };

  if (bonusOuter) {
    for (let b10 = 0; b10 <= bonusMax10x; b10 += bonusStep10x) {
      for (const lb of liveBonuses) {
        if (pruneByMultiplier && target % LIVE_BONUS_MULTIPLIERS[lb] !== 0) continue;
        scan(lb, b10);
      }
    }
  } else {
    for (const lb of liveBonuses) {
      for (let b10 = 0; b10 <= bonusMax10x; b10 += bonusStep10x) {
        if (pruneByMultiplier && target % LIVE_BONUS_MULTIPLIERS[lb] !== 0) continue;
        scan(lb, b10);
      }
    }
  }

  return plans;
}
