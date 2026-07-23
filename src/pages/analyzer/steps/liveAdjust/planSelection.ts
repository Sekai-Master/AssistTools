import type { MultiLiveAdjustResult, MultiLivePlan } from "../../lib/multiLiveAdjust";
import type { Adopted } from "./types";

/**
 * 全ユニットが同一基礎点（＝実質同一曲）で組めているか（P1-6・エビ詰めモード判定）。
 * 基礎点が1種類しかなければ、あとは曲候補の中から1曲選ぶだけで済む。
 */
export function isSingleSong(plan: Pick<MultiLivePlan, "units">): boolean {
  return new Set(plan.units.map((u) => u.basePoint)).size <= 1;
}

/** 採択中プランを Adopted から実体へ解決する。範囲外は primary へフォールバックする。 */
export function getAdoptedPlan(
  multi: MultiLiveAdjustResult,
  adopted: Adopted
): MultiLivePlan | undefined {
  if (multi.plans.length === 0) return undefined;
  if (adopted.kind === "variant" && multi.sameCountVariants.length > 0) {
    const i = Math.min(adopted.index, multi.sameCountVariants.length - 1);
    return multi.sameCountVariants[i];
  }
  if (adopted.kind === "frontier" && multi.plans.length > 1) {
    const i = Math.min(Math.max(adopted.index, 1), multi.plans.length - 1);
    return multi.plans[i];
  }
  return multi.plans[0];
}
