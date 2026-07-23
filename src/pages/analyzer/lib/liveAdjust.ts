import {
  BONUS_STEP_10X,
  DEFAULT_BASE_POINT,
  MAX_SCORE_N,
  MAX_SEARCH_BONUS_10X,
  SCORE_STEP,
} from "./constants";
import { calcLivePt } from "./calcLivePt";
import { collectScorePlans, findScoreStep } from "./scoreSearch";

/**
 * ライブでの端数調整。
 *
 * 「あと何ポイント足りないか」に対して、独りんぼエンヴィー（基礎点100）を
 * ライブボーナス0〜1消費（既定。マイセカイ不使用モードでは0〜10に拡張される）で
 * 叩いたときに必要なスコア帯を逆算する。
 *
 * 2つの経路があり、どちらか一方でも成立すれば調整可能とみなす。
 *   5.1 現在のボーナスのまま着地できるか
 *   5.2 編成を組み替えて別のボーナス値にすれば着地できるか
 * この2つは独立に成立しうるので、判定は必ず両方を見終えてから確定させること。
 */

export interface AdjustmentPlan {
  liveBonus: number;
  bonus: number;
  minScore: number;
  maxScore: number;
}

export interface LiveAdjustResult {
  status: "OK" | "NG";
  targetScoreRange?: { min: number; max: number };
  plans: AdjustmentPlan[];
  /** 探索に使ったボーナス上限（%）。ログとエラー文言で使う */
  searchedMaxBonus: number;
  /** この条件（ボーナス・許可LB）で1回のライブが吸収できる上限Pt。NG時の案内で使う */
  maxAdjustablePt: number;
  logs: string[];
}

/** 端数調整に使う楽曲の基礎点。独りんぼエンヴィー固定。 */
const ADJUST_BASE = DEFAULT_BASE_POINT;

/**
 * 端数調整で消費を許すライブボーナス（既定）。
 * 通常モードでは吸収役がマイセカイにあり、端数調整は「安い操作」であるべきなので 0〜1 に縛る。
 * マイセカイを使わないモードでは調整ライブが唯一の吸収役になるため、
 * 呼び出し側が liveBonuses でこの縛りを広げる（calculator.ts 参照）。
 */
export const ADJUST_LIVE_BONUSES = [0, 1] as const;

/**
 * 1回の調整ライブで到達できる上限Pt。
 * calcLivePt はスコア係数・ボーナス・LB倍率のすべてに単調非減少なので、
 * 「探索上限ボーナス × 最大スコア係数 × 最大LB」の1点評価で厳密な上限になる。
 * 探索前の枝刈りと、NG時に「最大◯Ptまで」と案内する両方に使う。
 */
export function maxLiveAdjustPt(bonus: number, liveBonuses: readonly number[]): number {
  const maxBonus10x = Math.min(Math.max(0, Math.floor(bonus * 10)), MAX_SEARCH_BONUS_10X);
  const maxLb = Math.max(...liveBonuses);
  return calcLivePt(ADJUST_BASE, maxBonus10x / 10, MAX_SCORE_N * SCORE_STEP, maxLb);
}

export function planLiveAdjustment(
  liveRequired: number,
  bonus: number,
  liveBonuses: readonly number[] = ADJUST_LIVE_BONUSES
): LiveAdjustResult {
  const logs: string[] = [];
  let status: "OK" | "NG" = "NG";
  let targetScoreRange: { min: number; max: number } | undefined;
  const plans: AdjustmentPlan[] = [];

  // ログとエラー文言用のLB範囲表記（既定 [0,1] では従来どおり "0-1"）。
  const lbLabel = `${Math.min(...liveBonuses)}-${Math.max(...liveBonuses)}`;
  const maxAdjustablePt = maxLiveAdjustPt(bonus, liveBonuses);

  // 調整が不要ならここで確定させる。
  // calcLivePt の最小値は 100 なので「0 Pt を獲得するスコア」は存在せず、
  // 探索に任せると必ず NG になる。ラストラン一本で端数を着地させるのは主用途なので、
  // ここを取り違えると正しいプランに「着地できません」と警告することになる。
  if (liveRequired === 0) {
    logs.push("[Live Adjustment] Required 0 Pt. No live adjustment needed.");
    return { status: "OK", targetScoreRange, plans, searchedMaxBonus: 0, maxAdjustablePt, logs };
  }

  // 5.2 と同じ上限で頭を抑える（10倍整数。詳細は 5.2 のコメント参照）。
  const maxBonus10x = Math.min(Math.max(0, Math.floor(bonus * 10)), MAX_SEARCH_BONUS_10X);

  // 上限を超える要求は探索するだけ無駄なのでここで確定させる。
  // マイセカイを使わないモードでは liveRequired が百万単位になりうるため、
  // 全探索（LB × ボーナス × スコア係数）を無条件に回すと UI が固まる。
  // ログは全探索が空振りしたときと同じ文言にし、既定経路の結果を変えない。
  if (liveRequired > maxAdjustablePt) {
    logs.push(
      `[Live Adjustment] No score coefficient found for ${liveRequired} Pt with ${lbLabel} LB (Searched 0-${maxBonus10x / 10}% bonus).`
    );
    return {
      status: "NG",
      targetScoreRange,
      plans,
      searchedMaxBonus: maxBonus10x / 10,
      maxAdjustablePt,
      logs,
    };
  }

  // 5.1 現在のボーナスのまま着地できるか
  for (const lb of liveBonuses) {
    const matchN = findScoreStep(ADJUST_BASE, bonus, lb, liveRequired);
    if (matchN !== -1) {
      status = "OK";
      if (!targetScoreRange) {
        targetScoreRange = {
          min: matchN * SCORE_STEP,
          max: (matchN + 1) * SCORE_STEP - 1,
        };
        logs.push(
          `[Live Adjustment] Target N=${matchN}, Score Range: ${targetScoreRange.min}~${targetScoreRange.max} (${lb} LB)`
        );
      }
    }
  }

  // 5.2 編成を組み替えた場合の候補。
  // ボーナスは 0.5% 刻みを取りうる（★4 のマスターランク1=12.5% / 3=17.5%）ので
  // 10倍整数で回す。上限は桁ミス対策で頭を抑える。
  // ライブボーナス外側の並びを保つ（提示順が変わらないよう bonusOuter:false）。
  plans.push(
    ...collectScorePlans({
      base: ADJUST_BASE,
      target: liveRequired,
      liveBonuses,
      bonusMax10x: maxBonus10x,
      bonusStep10x: BONUS_STEP_10X,
      bonusOuter: false,
    })
  );

  // 5.1 が駄目でも 5.2 に候補があれば調整可能。
  // この昇格を 5.2 のループ内でやると、5.1 が成立していたときのログが変わる。
  if (plans.length > 0) {
    if (status === "NG") {
      status = "OK";
      logs.push(
        `[Live Adjustment] Cannot adjust with current bonus. Found ${plans.length} plans (${lbLabel} LB).`
      );
    }
  } else if (status === "NG") {
    logs.push(
      `[Live Adjustment] No score coefficient found for ${liveRequired} Pt with ${lbLabel} LB (Searched 0-${maxBonus10x / 10}% bonus).`
    );
  }

  return {
    status,
    targetScoreRange,
    plans,
    searchedMaxBonus: maxBonus10x / 10,
    maxAdjustablePt,
    logs,
  };
}
