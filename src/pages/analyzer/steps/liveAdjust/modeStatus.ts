import type { CalculationResultV6 } from "../../lib/calculator";
import type { MultiLiveAdjustResult } from "../../lib/multiLiveAdjust";

/**
 * Step2（ライブ調整）2モードの「単独で着地できるか」判定（R6 §6-4）。
 *
 * NgPanels.tsx（NG案内・モード切替の提示）と LiveAdjustStep.tsx（footer の
 * 「このステップ完了時」表示）の両方がここから import する。二重実装すると
 * 「footerはOKと出すのにNG案内も出る」のような食い違いが起きるため一本化する。
 */

/**
 * モードA（曲固定・ボーナス選択）が単独で着地できるか。
 *
 * R6でモードAに複数回化（multiA）が入ったので、単発（targetScoreRange /
 * adjustmentPlans）が組めなくても multiA が OK なら着地できる（lib実装結果より）。
 */
export function isModeAOk(live: CalculationResultV6["liveAdjustment"]): boolean {
  if (live.requiredPt === 0) return true;
  const singleOk = !!live.targetScoreRange || (live.adjustmentPlans?.length ?? 0) > 0;
  return singleOk || live.multiA?.status === "OK";
}

/** モードB（曲可変・複数回）が単独で着地できるか。 */
export function isModeBOk(
  live: CalculationResultV6["liveAdjustment"],
  multi: MultiLiveAdjustResult | undefined
): boolean {
  if (live.requiredPt === 0) return true;
  return multi?.status === "OK";
}
