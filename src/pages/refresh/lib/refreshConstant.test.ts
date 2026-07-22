import { describe, expect, it } from "vitest";
import {
  MEASURED_CONSTANTS,
  constantFromBasePoint,
  constantRange,
  getRefreshConstant,
  isMeasured,
} from "./refreshConstant";

/** 基礎点=floor((定数+267)/3.5) の逆算レンジと実測上書きの安全網。 */

describe("constantRange — 基礎点→定数レンジ", () => {
  it("代表値", () => {
    expect(constantRange(100)).toEqual([83, 86]);
    expect(constantRange(107)).toEqual([108, 110]);
    expect(constantRange(112)).toEqual([125, 128]);
    expect(constantRange(113)).toEqual([129, 131]);
  });

  it("記事の実測定数はすべて自分の基礎点レンジに収まる", () => {
    const cases: [number, number][] = [
      [84, 100],
      [108, 107],
      [127, 112],
      [191, 130],
    ];
    for (const [k, bp] of cases) {
      // 逆関数の一致
      expect(Math.floor((k + 267) / 3.5)).toBe(bp);
      const [lo, hi] = constantRange(bp);
      expect(k).toBeGreaterThanOrEqual(lo);
      expect(k).toBeLessThanOrEqual(hi);
    }
  });
});

describe("getRefreshConstant — 実測優先", () => {
  it("実測がある曲は実測値", () => {
    expect(getRefreshConstant(100, "074")).toBe(84);
    expect(getRefreshConstant(107, "141")).toBe(108);
    expect(getRefreshConstant(130, "186")).toBe(191);
    expect(isMeasured("074")).toBe(true);
  });

  it("実測が無い曲は基礎点レンジ中央値", () => {
    expect(getRefreshConstant(113, "467")).toBe(constantFromBasePoint(113));
    expect(getRefreshConstant(113)).toBe(constantFromBasePoint(113));
    expect(isMeasured("467")).toBe(false);
    // 基礎点113 → レンジ[129,131] → 中央値130
    expect(constantFromBasePoint(113)).toBe(130);
  });

  it("実測テーブルの各値は自分のIDの基礎点レンジ内", () => {
    // id→基礎点の対応（transformedMusics 由来の既知値）
    const idToBase: Record<string, number> = { "074": 100, "141": 107, "104": 112, "186": 130 };
    for (const [id, k] of Object.entries(MEASURED_CONSTANTS)) {
      const bp = idToBase[id];
      const [lo, hi] = constantRange(bp);
      expect(k).toBeGreaterThanOrEqual(lo);
      expect(k).toBeLessThanOrEqual(hi);
    }
  });
});
