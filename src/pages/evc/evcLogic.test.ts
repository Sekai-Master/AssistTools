import { describe, expect, it } from "vitest";
import {
  effectiveValue,
  formatCandidates,
  innerValueFromEffective,
  ocSkillCandidates,
  reverseVerdict,
  toHalfWidthNumber,
  trainedSkillValue,
  vsSkillValue,
} from "./evcLogic";

describe("toHalfWidthNumber", () => {
  it("全角数字を半角化して数値にする", () => {
    expect(toHalfWidthNumber("１５０")).toBe(150);
    expect(toHalfWidthNumber("１２．５")).toBe(12.5);
  });
  it("空・非数値は null", () => {
    expect(toHalfWidthNumber("")).toBeNull();
    expect(toHalfWidthNumber("abc")).toBeNull();
  });
});

describe("順方向 effectiveValue", () => {
  it("round(先頭 + (内部 - 先頭) × 0.2)", () => {
    // 先頭150, 内部620 → 150 + (470)*0.2 = 150+94 = 244
    expect(effectiveValue(150, 620)).toBe(244);
    // 内部=先頭なら実効値=先頭
    expect(effectiveValue(150, 150)).toBe(150);
  });
});

describe("逆算 innerValueFromEffective", () => {
  it("順方向の逆関数になっている", () => {
    const inner = innerValueFromEffective(244, 150);
    expect(inner).toBeCloseTo(620, 6);
  });
});

describe("trainedSkillValue（特訓後）", () => {
  it("base(Lv) + floor(min(rank,100)/2)", () => {
    expect(trainedSkillValue(4, 100)).toBe(110 + 50); // 160
    expect(trainedSkillValue(1, 50)).toBe(90 + 25); // 115
  });
  it("ランクは100でキャップ", () => {
    expect(trainedSkillValue(4, 200)).toBe(160);
  });
});

describe("vsSkillValue（VS特訓前）", () => {
  it("baseVS(Lv) + 30 × min(非VSユニット数, 2)", () => {
    expect(vsSkillValue(4, 0)).toBe(90);
    expect(vsSkillValue(4, 1)).toBe(120);
    expect(vsSkillValue(4, 2)).toBe(150);
    expect(vsSkillValue(4, 5)).toBe(150); // 2でキャップ
  });
});

describe("ocSkillCandidates（OC特訓前）", () => {
  it("各枠 min(base+floor(inner/2), 上限) を集計し個数付き整形", () => {
    // Lv4: base=80, 上限=150。inner=140 → 80+70=150(上限), inner=120 → 80+60=140
    const c = ocSkillCandidates(4, [140, 140, 120]);
    expect(c).toEqual([
      { value: 150, count: 2 },
      { value: 140, count: 1 },
    ]);
    expect(formatCandidates(c)).toBe("150(2) or 140");
  });
});

describe("reverseVerdict", () => {
  it("内部値が先頭未満なら再確認", () => {
    expect(reverseVerdict(100, 150).kind).toBe("recheck");
  });
  it("上限超過なら該当なし", () => {
    // inner = (eff-150)/0.2 + 150 > 150+640=790 → eff > 278
    expect(reverseVerdict(300, 150).kind).toBe("none");
  });
  it("通常範囲は値を返す", () => {
    const v = reverseVerdict(244, 150);
    expect(v.kind).toBe("value");
    if (v.kind === "value") expect(v.inner).toBeCloseTo(620, 6);
  });
});
