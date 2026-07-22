import { describe, expect, it } from "vitest";
import { LIVE_BONUS_MULTIPLIERS, calcLivePt } from "./calcLivePt";

describe("calcLivePt", () => {
  it("実機実測値を再現する（base=114, bonus=416%, score=1,224,240 → 946）", () => {
    // 「小数第1位まで保持」を確定させた実測。base=100では3方式が同値になり判別
    // できないため、この114の実測が丸め方式の一次証拠になっている。
    expect(calcLivePt(114, 416, 1_224_240, 0)).toBe(946);
  });

  it("最小値は100（score=0, bonus=0, base=100, 0炊き）", () => {
    expect(calcLivePt(100, 0, 0, 0)).toBe(100);
  });

  it("ライブボーナス倍率が正しく乗る", () => {
    const zero = calcLivePt(100, 100, 500_000, 0);
    expect(calcLivePt(100, 100, 500_000, 1)).toBe(zero * LIVE_BONUS_MULTIPLIERS[1]);
    expect(calcLivePt(100, 100, 500_000, 10)).toBe(zero * LIVE_BONUS_MULTIPLIERS[10]);
  });

  it("0.5%刻みのボーナスでも整数で正しく処理する", () => {
    // bonus に小数が来ても NaN や誤差を出さない（内部で100倍整数化している）。
    const v = calcLivePt(100, 12.5, 400_000, 0);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });

  it("どの入力でも整数を返す（浮動小数点の桁落ちで壊れない）", () => {
    // 割り算を最後まで遅らせているので、base×step のところで
    // 32299.999... のような桁落ちが起きず、常に整数になる。
    for (const base of [100, 114, 125, 150]) {
      for (const bonus of [0, 12.5, 217.5, 615]) {
        for (const score of [0, 20_000, 900_000, 2_500_000]) {
          expect(Number.isInteger(calcLivePt(base, bonus, score, 0))).toBe(true);
        }
      }
    }
  });

  it("スコアが2万点をまたぐと係数が1上がる", () => {
    const below = calcLivePt(100, 100, 19_999, 0);
    const at = calcLivePt(100, 100, 20_000, 0);
    expect(at).toBeGreaterThan(below);
  });
});
