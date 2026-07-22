import { describe, expect, it } from "vitest";
import { type WorkParams, computeWork, hourlyRateAt, minutesForTarget } from "./worktime";

// 基準焚き5で時速50万、エビ74.8s・OH54
const P: WorkParams = {
  hourlyRate: 500_000,
  refTaki: 5,
  songLengthSec: 74.8,
  overheadSec: 54,
  startingLB: 0,
};
const seg = (taki: number, minutes: number) => ({ id: "s", taki, minutes });

describe("hourlyRateAt", () => {
  it("焚き数の倍率比で時速がスケールする", () => {
    // M[5]=25, M[3]=15, M[7]=29
    expect(hourlyRateAt(P, 5)).toBeCloseTo(500_000, 6);
    expect(hourlyRateAt(P, 3)).toBeCloseTo((500_000 * 15) / 25, 6);
    expect(hourlyRateAt(P, 7)).toBeCloseTo((500_000 * 29) / 25, 6);
  });
});

describe("computeWork", () => {
  it("時速×時間で到達ポイント（基準焚きは時速そのまま）", () => {
    const r = computeWork([seg(5, 60)], P);
    expect(r.totalPoints).toBe(500_000);
    expect(r.totalMinutes).toBe(60);
  });

  it("多組み合わせの合算（点数・ライボ）", () => {
    const r = computeWork([seg(5, 60), seg(7, 30)], P);
    const secPerPlay = 74.8 + 54;
    const plays1 = (60 * 60) / secPerPlay;
    const plays2 = (30 * 60) / secPerPlay;
    expect(r.totalLB).toBe(Math.round(plays1 * 5 + plays2 * 7));
    const pts = hourlyRateAt(P, 5) * 1 + hourlyRateAt(P, 7) * 0.5;
    expect(r.totalPoints).toBe(Math.round(pts));
  });

  it("必要石: 消費 − (所持 + 自然回復) を10倍", () => {
    const r = computeWork([seg(5, 60)], { ...P, startingLB: 0 });
    const plays = (60 * 60) / (74.8 + 54);
    const deficit = Math.max(0, plays * 5 - 60 / 30);
    expect(r.requiredCrystals).toBe(Math.ceil(deficit) * 10);
  });

  it("所持ライボが多ければ必要石は0", () => {
    expect(computeWork([seg(1, 30)], { ...P, startingLB: 999 }).requiredCrystals).toBe(0);
  });
});

describe("minutesForTarget", () => {
  it("目標ポイントに必要な稼働分（往復一致）", () => {
    const mins = minutesForTarget(1_000_000, P, 5);
    expect(mins).toBeCloseTo(120, 6); // 時速50万で100万pt=2時間
    expect(computeWork([seg(5, mins)], P).totalPoints).toBe(1_000_000);
  });

  it("焚き数が高いほど必要時間が短い", () => {
    const t5 = minutesForTarget(1_000_000, P, 5);
    const t7 = minutesForTarget(1_000_000, P, 7);
    expect(t7).toBeLessThan(t5);
  });
});
