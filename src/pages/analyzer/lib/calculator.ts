import { DEFAULT_BASE_POINT } from "./constants";
import { calcLivePt } from "./calcLivePt";
import { allocateMySekai, calculateUnitBasePt, isAllocationAttempted } from "./mySekai";
import { type AdjustmentPlan, planLiveAdjustment } from "./liveAdjust";
import { type FinalRunPlan, finalRunSearchedMaxBonus, planFinalRun } from "./finalRun";

/**
 * 調整プランの組み立て。
 *
 * 実際の計算は用途ごとのモジュールに分かれている。
 *   calcLivePt.ts … ライブでの獲得ポイントの式
 *   mySekai.ts    … マイセカイの単価と採取配分
 *   liveAdjust.ts … 端数調整のスコア逆算
 *   finalRun.ts   … ラストランのプラン列挙
 * ここはそれらを順に呼び、ログと検証結果をまとめるだけ。
 */

export { ENVY_ID } from "./constants";
export { LIVE_BONUS_MULTIPLIERS, calcLivePt } from "./calcLivePt";
export type { AdjustmentPlan } from "./liveAdjust";
export type { FinalRunPlan } from "./finalRun";

/**
 * 計算に必要な楽曲情報の最小の契約。
 *
 * 基礎点の出どころの優先順位（実測値 > 取得データ > 同梱データ）は
 * lib/musicSources.ts の責務なので、ここに届く時点では1つに決まっている前提。
 */
export interface MusicData {
  id: string;
  basePoint: number;
}

export interface CalculationResultV6 {
  currentPt: number;
  targetPt: number;
  finalRunPt: number;
  totalDiff: number;
  adjustableDiff: number;
  unitBasePt: number;
  mySekaiAllocation: {
    countA: number;
    countB: number;
    countC: number;
    totalPt: number;
  };
  liveAdjustment: {
    requiredPt: number;
    status: "OK" | "NG";
    targetScoreRange?: { min: number; max: number };
    adjustmentPlans?: AdjustmentPlan[];
    logMessage: string;
  };
  finalRunPlans: FinalRunPlan[];
  finalBase: number;
  finalEstimatedPt: number;
  isVerified: boolean;
  logs: string[];
}

/** マイセカイ単価。UIが入力中のヒント表示にも使う。 */
export const calculateUnitBasePtEstimate = calculateUnitBasePt;

export function calculatePlanV6(
  currentPt: number,
  targetPt: number,
  finalRunPt: number,
  talent: number,
  bonus: number,
  hasWorldPass: boolean,
  finalSongId: string,
  musicsList: MusicData[]
): CalculationResultV6 {
  const musics = musicsList;
  const logs: string[] = [];
  const log = (title: string, msg: string) => logs.push(`[${title}] ${msg}`);

  log("Initial Settings", `Current: ${currentPt}, Target: ${targetPt}, Final: ${finalRunPt}`);
  log(
    "Environment",
    `Talent: ${talent}, Bonus: ${bonus}%, World Pass: ${hasWorldPass ? "Active" : "Inactive"}`
  );

  // 1. マイセカイ単価
  const unitBasePt = calculateUnitBasePt(talent, bonus, hasWorldPass);
  log("Unit Pt", `Value: ${unitBasePt} (Auto)`);

  // 2. 埋めるべき差分
  const totalDiff = targetPt - currentPt;
  const adjustableDiff = totalDiff - finalRunPt;
  log(
    "Diff Calc",
    `Total Diff: ${totalDiff}, Adjustable: ${adjustableDiff} (Reserved ${finalRunPt} for Final)`
  );

  if (adjustableDiff < 0) {
    log("Error", "Target is lower than Current + Final Run. Impossible to adjust.");
  }

  // 3. マイセカイ配分
  const allocation = allocateMySekai(adjustableDiff, unitBasePt);
  if (isAllocationAttempted(adjustableDiff, unitBasePt)) {
    log(
      "MySekai Allocation",
      `Wood/Rock(1.0):${allocation.countA}, Glitter(0.5):${allocation.countB}, Flower(0.2):${allocation.countC} -> Total ${allocation.totalPt} Pt`
    );
  } else {
    log("MySekai Allocation", "Adjustable diff <= 100 Pt, skipped MySekai calc.");
  }

  // 4-5. ライブ端数調整
  const liveRequired = adjustableDiff - allocation.totalPt;
  const live = planLiveAdjustment(liveRequired, bonus);
  logs.push(...live.logs);

  // 6. ラストラン
  // 基礎点はどの曲も同じ経路（musicsList → 見つからなければ既定値）で引く。
  // 以前は独りんぼエンヴィー(074)だけ musicsList を参照せず既定値100に固定していたが、
  // 074 が将来 100 以外に解決される可能性を残す特別扱いだったので撤廃した。
  const songData = musics.find((m) => m.id === finalSongId);
  let finalBase = DEFAULT_BASE_POINT;
  if (songData && Number.isFinite(songData.basePoint)) {
    finalBase = songData.basePoint;
  } else {
    log("Data Source", `No base point for ID ${finalSongId}, defaulting to ${DEFAULT_BASE_POINT}.`);
  }
  log("Final Run Plan", `Target: ${finalRunPt}, Song Base: ${finalBase} (ID: ${finalSongId})`);

  const finalRunPlans = planFinalRun(finalRunPt, finalBase, bonus);
  if (finalRunPt > 0) {
    log(
      "Final Run Plan",
      `Found ${finalRunPlans.length} plans (bonus <= ${finalRunSearchedMaxBonus(bonus)}%).`
    );
  }

  // 7. 検証
  const liveAdjPt = live.status === "OK" ? liveRequired : 0;
  const estimatedTotal = currentPt + allocation.totalPt + liveAdjPt + finalRunPt;
  const isVerified = estimatedTotal === targetPt && live.status === "OK";

  return {
    currentPt,
    targetPt,
    finalRunPt,
    totalDiff,
    adjustableDiff,
    unitBasePt,
    mySekaiAllocation: allocation,
    liveAdjustment: {
      requiredPt: liveRequired,
      status: live.status,
      targetScoreRange: live.targetScoreRange,
      adjustmentPlans: live.plans,
      logMessage: live.status === "OK" ? `目標: ${liveRequired}` : `調整不可 ${liveRequired}`,
    },
    finalRunPlans,
    finalBase,
    finalEstimatedPt: estimatedTotal,
    isVerified,
    logs,
  };
}

// 端数調整の逆算に使うので再エクスポートしておく
export { calcLivePt as calcLivePtRaw };
