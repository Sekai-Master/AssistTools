import { describe, expect, it } from "vitest";
import {
  MAX_PT_VALUES_PER_PLAN,
  buildReachablePtTable,
  planFromReachablePtTable,
  planMultiLiveAdjustment,
} from "./multiLiveAdjust";
import { calcLivePt } from "./calcLivePt";

/**
 * multiLiveAdjust.test.ts から分離（ファイル800行キャップのため）。
 * 対象は破壊者レポート第3周の残り3項目:
 *   - 弱点6: sameCountVariants の lbCost 昇順テストが同値ケースしか見ていない
 *   - 弱点7: findExhaustiveExact の事前フィルタが結果を変えないことの固定
 *   - 弱点3/5: 到達可能Pt表の使い回し最適化・MAX_PT_VALUES_PER_PLAN の export
 */

const BONUS = 435;
const REAL_BASES = [100, 103, 114, 116, 130] as const;
const BRIEF_BASES = [
  100, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 130,
] as const;

describe("planMultiLiveAdjustment — sameCountVariants の lbCost 昇順（弱点6対応）", () => {
  // 前回・前々回のテストはいずれも全 variant が lbCost 同値（lb=0）のケースしか
  // 見ておらず、「昇順」の検証が実質「全要素が等しい」で通ってしまっていた
  // （破壊者レポート弱点6）。ここでは実際に lbCost が異なる代表ケースを固定する。
  it("100,000 Pt / bases[100,130] は主役と異なる lbCost の代替が2件、狭義昇順で並ぶ", () => {
    const r = planMultiLiveAdjustment(100_000, 990, [100, 130]);
    expect(r.status).toBe("OK");
    expect(r.plans[0].lbCost).toBe(13);
    expect(r.sameCountVariants.map((v) => v.lbCost)).toEqual([15, 18]);
    // 同値ではなく真に異なることの確認（弱点6の核心）
    const distinct = new Set(r.sameCountVariants.map((v) => v.lbCost));
    expect(distinct.size).toBeGreaterThan(1);
    for (let i = 1; i < r.sameCountVariants.length; i += 1) {
      expect(r.sameCountVariants[i].lbCost).toBeGreaterThan(r.sameCountVariants[i - 1].lbCost);
    }
    for (const v of r.sameCountVariants) {
      expect(v.liveCount).toBe(r.plans[0].liveCount);
      expect(v.totalPt).toBe(100_000);
    }
  });

  it("470,000 Pt / ブリーフ28基礎点・bonus990% でも lbCost が異なる代替を含み、非減少で並ぶ", () => {
    const r = planMultiLiveAdjustment(470_000, 990, BRIEF_BASES);
    expect(r.status).toBe("OK");
    const costs = r.sameCountVariants.map((v) => v.lbCost);
    expect(new Set(costs).size).toBeGreaterThan(1);
    for (let i = 1; i < costs.length; i += 1) {
      expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]);
    }
  });
});

describe("弱点7: findExhaustiveExact の事前フィルタは結果を変えない", () => {
  // lbCost 事前比較で planOf 生成を省く最適化（弱点7）が best/variants の
  // 中身を変えていないことを、全数照合帯の複数ケースで固定する。
  it("全数照合帯の複数 req で status/plans/sameCountVariants が期待どおり", () => {
    const minPt = calcLivePt(100, 990, 0, 0);
    // 3,663 は診断5由来の既知ケース（3値すべて異なる解が1つだけ存在）
    const r1 = planMultiLiveAdjustment(3_663, 990, [100, 130]);
    expect(r1.status).toBe("OK");
    expect(r1.plans[0].liveCount).toBe(3);
    expect(r1.plans[0].totalPt).toBe(3_663);

    // 3,714 は弱点9由来の既知ケース（3値解が複数存在し、代替が3件出る）
    const r2 = planMultiLiveAdjustment(3_714, 990, [100, 130]);
    expect(r2.status).toBe("OK");
    expect(r2.plans[0].liveCount).toBe(3);
    expect(r2.sameCountVariants.length).toBe(3);

    // 全数照合帯の下端付近を広く走査し、壊れていないことを確認
    for (let req = minPt; req < minPt + 400; req += 7) {
      const r = planMultiLiveAdjustment(req, 990, [100, 130]);
      expect(["OK", "NG"]).toContain(r.status);
      if (r.status === "OK") {
        expect(r.plans[0].totalPt).toBe(req);
      }
    }
  });
});

describe("MAX_PT_VALUES_PER_PLAN（弱点5対応）", () => {
  it("通常探索1案が使うPt値の種類数上限は2（UIの「Pt値2種類」表記の根拠）", () => {
    expect(MAX_PT_VALUES_PER_PLAN).toBe(2);
  });
});

describe("buildReachablePtTable / planFromReachablePtTable（弱点3: 表の使い回し最適化）", () => {
  // planScoreZeroFinish は「同じ bonus・basePoints・maxScoreN で liveRequired だけ
  // 変えて何十〜何百回も探索する」ため、到達可能Pt表を1回構築して使い回す経路を
  // 追加した（多点で候補ごとに毎回 planMultiLiveAdjustment を呼ぶより速い）。
  // ここでは「表を使い回しても単発呼び出しと1件ずつ完全に同じ結果になる」ことを
  // 幅広い liveRequired で固定し、最適化が結果を変えていないことを保証する。
  it("表を使い回しても単発呼び出しと同一の結果を返す（広い liveRequired で突き合わせ）", () => {
    const bases = REAL_BASES;
    const table = buildReachablePtTable(BONUS, bases);
    const reqs = [0, -50, 1, 3_663, 3_714, 7_000, 12_345, 25_000, 60_000, 100_000, 470_000, 250_000];
    for (const req of reqs) {
      const direct = planMultiLiveAdjustment(req, BONUS, bases);
      const viaTable = planFromReachablePtTable(req, table);
      expect(viaTable.status).toBe(direct.status);
      expect(viaTable.plans).toEqual(direct.plans);
      expect(viaTable.sameCountVariants).toEqual(direct.sameCountVariants);
      expect(viaTable.reason).toBe(direct.reason);
      expect(viaTable.landability).toBe(direct.landability);
      expect(viaTable.maxPtPerLive).toBe(direct.maxPtPerLive);
      expect(viaTable.minPtPerLive).toBe(direct.minPtPerLive);
    }
  });

  it("28基礎点のブリーフ規模でも表の使い回しは単発呼び出しと一致する", () => {
    const table = buildReachablePtTable(990, BRIEF_BASES);
    for (const req of [7_000, 12_345, 25_000, 60_000, 100_000, 52_437, 199_999]) {
      const direct = planMultiLiveAdjustment(req, 990, BRIEF_BASES);
      const viaTable = planFromReachablePtTable(req, table);
      expect(viaTable).toEqual(direct);
    }
  });
});
