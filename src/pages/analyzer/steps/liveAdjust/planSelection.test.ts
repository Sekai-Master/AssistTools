import { describe, expect, it } from "vitest";
import type { MultiLiveAdjustResult, MultiLivePlan, MultiLiveUnit } from "../../lib/multiLiveAdjust";
import { getAdoptedPlan, isSingleSong } from "./planSelection";

/** テスト用の最小 MultiLiveUnit。basePoint 以外は isSingleSong/getAdoptedPlan の判定に無関係。 */
function unit(basePoint: number): MultiLiveUnit {
  return { basePoint, liveBonus: 0, minScore: 0, maxScore: 19999, pt: 1000, count: 1 };
}

function plan(basePoints: number[], liveCount = basePoints.length, lbCost = 0): MultiLivePlan {
  return { units: basePoints.map(unit), liveCount, lbCost, totalPt: basePoints.length * 1000 };
}

/** getAdoptedPlan のテスト用に multi の骨格を作る（plans/sameCountVariants 以外は無関係）。 */
function multiResult(plans: MultiLivePlan[], sameCountVariants: MultiLivePlan[] = []): MultiLiveAdjustResult {
  return {
    status: plans.length > 0 ? "OK" : "NG",
    plans,
    sameCountVariants,
    liveCountCap: 50,
    maxPtPerLive: 0,
    minPtPerLive: 0,
    logs: [],
  };
}

describe("isSingleSong", () => {
  it("全ユニットが同一基礎点なら true", () => {
    expect(isSingleSong(plan([100, 100, 100]))).toBe(true);
  });

  it("基礎点が混ざっていれば false", () => {
    expect(isSingleSong(plan([100, 130]))).toBe(false);
  });

  it("ユニット0件（調整不要）は true 扱い（Set size 0 <= 1）", () => {
    expect(isSingleSong(plan([]))).toBe(true);
  });
});

describe("getAdoptedPlan", () => {
  const primary = plan([100, 100], 2, 5);
  const variantA = plan([100, 130], 2, 3);
  const frontierB = plan([100, 100, 100], 3, 2);
  const multi = multiResult([primary, frontierB], [variantA]);

  it("primary は plans[0] を返す", () => {
    expect(getAdoptedPlan(multi, { kind: "primary" })).toBe(primary);
  });

  it("variant は sameCountVariants[index] を返す", () => {
    expect(getAdoptedPlan(multi, { kind: "variant", index: 0 })).toBe(variantA);
  });

  it("variant の index が範囲外なら末尾へクランプする", () => {
    expect(getAdoptedPlan(multi, { kind: "variant", index: 99 })).toBe(variantA);
  });

  it("sameCountVariants が空なら variant 指定でも primary にフォールバックする", () => {
    const noVariants = multiResult([primary]);
    expect(getAdoptedPlan(noVariants, { kind: "variant", index: 0 })).toBe(primary);
  });

  it("frontier は plans[index] を返す（1始まり想定）", () => {
    expect(getAdoptedPlan(multi, { kind: "frontier", index: 1 })).toBe(frontierB);
  });

  it("frontier の index が0以下でも1にクランプする（plans[0]=主役には落とさない）", () => {
    expect(getAdoptedPlan(multi, { kind: "frontier", index: 0 })).toBe(frontierB);
  });

  it("frontier の index が範囲外なら末尾へクランプする", () => {
    expect(getAdoptedPlan(multi, { kind: "frontier", index: 99 })).toBe(frontierB);
  });

  it("plans が1件以下なら frontier 指定でも primary にフォールバックする", () => {
    const noFrontier = multiResult([primary]);
    expect(getAdoptedPlan(noFrontier, { kind: "frontier", index: 1 })).toBe(primary);
  });

  it("plans が空なら undefined を返す", () => {
    expect(getAdoptedPlan(multiResult([]), { kind: "primary" })).toBeUndefined();
  });
});
