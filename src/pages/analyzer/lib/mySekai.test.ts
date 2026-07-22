import { describe, expect, it } from "vitest";
import { allocateMySekai, calculateUnitBasePt } from "./mySekai";
import { LIVE_ADJUST_RESERVE, MEMORY_A_10X, MEMORY_B_10X, MEMORY_C_10X } from "./constants";

describe("calculateUnitBasePt", () => {
  it("実機実測の2点を再現する", () => {
    // 総合力297,159 / ボーナス615% → 1100 Pt
    expect(calculateUnitBasePt(297_159, 615, false)).toBe(1100);
    // 総合力313,460 / ボーナス416% → 800 Pt
    expect(calculateUnitBasePt(313_460, 416, false)).toBe(800);
  });

  it("ワールドパスで単価が5倍になる", () => {
    const base = calculateUnitBasePt(297_159, 615, false);
    expect(calculateUnitBasePt(297_159, 615, true)).toBe(base * 5);
  });
});

describe("allocateMySekai", () => {
  it("差分がリザーブ以下なら何も採らない", () => {
    const r = allocateMySekai(LIVE_ADJUST_RESERVE, 1100);
    expect(r).toEqual({ countA: 0, countB: 0, countC: 0, totalPt: 0 });
  });

  it("単価0では無限ループにも配分にもならない", () => {
    const r = allocateMySekai(100_000, 0);
    expect(r.totalPt).toBe(0);
  });

  it("totalPt は配分内容（メモリ合計×単価）と一致する", () => {
    const unit = 800;
    const r = allocateMySekai(50_000, unit);
    const memories10x = r.countA * MEMORY_A_10X + r.countB * MEMORY_B_10X + r.countC * MEMORY_C_10X;
    expect(r.totalPt).toBe(Math.floor((memories10x * unit) / 10));
  });

  it("リザーブ分（端数調整用）を残す", () => {
    const r = allocateMySekai(50_000, 800);
    expect(r.totalPt).toBeLessThanOrEqual(50_000 - LIVE_ADJUST_RESERVE);
  });

  it("capacity 内でメモリ合計を最大化している（総当たりと一致）", () => {
    // 配分アルゴリズムは maxA / maxA-1 の近傍のみ探索する近似だが、
    // メモリ値 {10,5,2}（0.1単位）ではこれで最適が取れる。総当たりで裏を取る。
    for (const diff of [1_100, 3_333, 7_777, 12_500, 40_000]) {
      const unit = 800;
      const r = allocateMySekai(diff, unit);
      const capacity = Math.floor(((diff - LIVE_ADJUST_RESERVE) * 10) / unit);

      let best = 0;
      for (let a = 0; a * MEMORY_A_10X <= capacity; a++) {
        const remA = capacity - a * MEMORY_A_10X;
        for (let b = 0; b * MEMORY_B_10X <= remA; b++) {
          const remB = remA - b * MEMORY_B_10X;
          const c = Math.floor(remB / MEMORY_C_10X);
          const sum = a * MEMORY_A_10X + b * MEMORY_B_10X + c * MEMORY_C_10X;
          if (sum > best) best = sum;
        }
      }
      const got = r.countA * MEMORY_A_10X + r.countB * MEMORY_B_10X + r.countC * MEMORY_C_10X;
      expect(got).toBe(best);
    }
  });
});
