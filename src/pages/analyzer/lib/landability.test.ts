import { describe, expect, it } from "vitest";
import { minAdjustablePt } from "./landability";
import { calcLivePt } from "./calcLivePt";
import { planMultiLiveAdjustment } from "./multiLiveAdjust";
import { DEFAULT_BASE_POINT } from "./constants";

/**
 * 着地可能性の下限（P2-7）の安全網。
 *
 * ブリーフ診断5:「1本で作れる最小値は calcLivePt(最小基礎点, bonus, 0, LB0)。
 * 残額がそれ未満なら原理的に着地不能」。閾値はボーナス依存なので**動的に計算**する
 * 必要があり、ハードコードすると別ボーナスで嘘の警告を出す。
 *
 * 期待値は既存テストの流儀どおり calcLivePt から導出する（マジックナンバー禁止）。
 * ただし「ボーナスを変えると閾値が動く」ことは値の比較で直接固定する。
 */

const REAL_BASES = [100, 103, 114, 116, 130] as const;

describe("minAdjustablePt", () => {
  it("最小基礎点・スコア0・LB0 の calcLivePt と一致する", () => {
    // calcLivePt は基礎点・スコア係数・LB倍率のいずれにも単調非減少なので、
    // 「全部最小」の1点が下限になる（maxPtPerLive の導出と対称）。
    for (const bonus of [0, 500, 990]) {
      expect(minAdjustablePt(bonus, REAL_BASES)).toBe(calcLivePt(100, bonus, 0, 0));
    }
  });

  it("基礎点の並び順に依らず最小基礎点を採る", () => {
    expect(minAdjustablePt(990, [130, 100, 114])).toBe(minAdjustablePt(990, [100, 114, 130]));
    expect(minAdjustablePt(990, [130, 114])).toBe(calcLivePt(114, 990, 0, 0));
  });

  it("ボーナスを上げると閾値が動く（動的計算であることの担保）", () => {
    const low = minAdjustablePt(0, REAL_BASES);
    const mid = minAdjustablePt(500, REAL_BASES);
    const high = minAdjustablePt(990, REAL_BASES);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    // ブリーフ診断5の実測: ボーナス990%・基礎点100 なら 1,090
    expect(minAdjustablePt(990, [100])).toBe(1090);
  });

  it("空・不正な基礎点は既定基礎点に退避する（distinctBasePoints と同じ規約）", () => {
    expect(minAdjustablePt(990, [])).toBe(calcLivePt(DEFAULT_BASE_POINT, 990, 0, 0));
    expect(minAdjustablePt(990, [NaN, 0, -114])).toBe(calcLivePt(DEFAULT_BASE_POINT, 990, 0, 0));
    // 非整数の基礎点（event_rate は整数のみ）は除外される
    expect(minAdjustablePt(990, [113.5, 114])).toBe(calcLivePt(114, 990, 0, 0));
  });
});

describe("minAdjustablePt と planMultiLiveAdjustment.minPtPerLive の整合", () => {
  it.each([0, 435, 990])(
    "bonus=%i: 探索結果の minPtPerLive と単独計算が一致する",
    (bonus) => {
      // Step1 や事前警告から探索を回さずに閾値を引けることが本関数の存在理由。
      // 両者がズレると「警告は出ないのに解が無い」状態になるので不変条件で縛る。
      const r = planMultiLiveAdjustment(1_000_000, bonus, REAL_BASES);
      expect(r.minPtPerLive).toBe(minAdjustablePt(bonus, REAL_BASES));
    }
  );

  it("基礎点1種（楽曲データ縮退時）でも一致する", () => {
    const r = planMultiLiveAdjustment(500_000, 990, [100]);
    expect(r.minPtPerLive).toBe(minAdjustablePt(990, [100]));
  });
});
