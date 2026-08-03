import { describe, expect, it } from "vitest";
import { paceFromRate, rateFromPerPlay, rateFromRun } from "./rateTools";

describe("実績から時速", () => {
  it("分をそのまま時速に伸ばす", () => {
    expect(rateFromRun(500_000, 60)).toBe(500_000);
    expect(rateFromRun(250_000, 30)).toBe(500_000);
    expect(rateFromRun(750_000, 90)).toBe(500_000);
  });

  it("測れないときは null（0 を返さない）", () => {
    // ★ 0 を返すと「時速0」と区別がつかない。そのまま設定されると計算が全部0になる。
    expect(rateFromRun(0, 60)).toBeNull();
    expect(rateFromRun(500_000, 0)).toBeNull();
    expect(rateFromRun(NaN, 60)).toBeNull();
    expect(rateFromRun(-100, 60)).toBeNull();
  });
});

describe("1回の獲得ptと周回ペースから時速", () => {
  it("掛けるだけ", () => {
    expect(rateFromPerPlay(18_000, 28)).toBe(504_000);
  });

  it("片方でも欠けたら null", () => {
    expect(rateFromPerPlay(18_000, 0)).toBeNull();
    expect(rateFromPerPlay(0, 28)).toBeNull();
  });
});

describe("時速と1回の獲得ptからペース", () => {
  it("割るだけ", () => {
    expect(paceFromRate(504_000, 18_000)).toBe(28);
  });

  it("片方でも欠けたら null", () => {
    expect(paceFromRate(504_000, 0)).toBeNull();
    expect(paceFromRate(0, 18_000)).toBeNull();
  });

  /**
   * ★ 丸めをここでやらない理由。時速→ペース→時速 と往復しても値が戻ることを縛る。
   *   途中で四捨五入すると、較正するたびに時速がじわじわずれていく。
   */
  it("時速→ペース→時速 で元に戻る（途中で丸めない）", () => {
    const perPlay = 17_345;
    const rate = 493_210;
    const pace = paceFromRate(rate, perPlay)!;
    expect(rateFromPerPlay(perPlay, pace)).toBeCloseTo(rate, 6);
  });
});
