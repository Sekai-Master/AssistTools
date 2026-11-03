import { describe, expect, it } from "vitest";
import { GRID } from "../../../workers/border/src/model";
import { SHAPE_POINTS, dayTicks, elapsedLabel, extentOf, hourAt, parseShape, runsOf, valueAxis } from "./historyShape";

const share = (f: (i: number) => number | null) => Array.from({ length: SHAPE_POINTS }, (_, i) => f(i));

describe("推移の形の読み取り", () => {
  it("格子の点の数は Worker の GRID と同じ", () => {
    expect(SHAPE_POINTS).toBe(GRID.length);
  });

  it("値＝割合×終値。順位は 50→2000 の順。知らない順位・長さ違い・数でない値の行は捨てる", () => {
    const got = parseShape({
      ranks: [
        { rank: 1000, final: 1000, share: share((i) => i / 50) },
        { rank: 50, final: 200, share: share((i) => (i === 2 ? null : 0.5)) },
        { rank: 5000, final: 1, share: share(() => 1) },
        { rank: 100, final: 1, share: [1] },
        { rank: 200, final: 1, share: share(() => Number.NaN) },
        { rank: 500, final: 0, share: share(() => 1) },
        { rank: 2000, final: 1, share: share((i) => (i === 0 ? ("1" as unknown as number) : 1)) },
        null,
      ],
    });
    expect(got.map((s) => s.rank)).toEqual(["50", "1000"]);
    expect(got[0].values[0]).toBe(100);
    expect(got[0].values[2]).toBeNull();
    expect(got[1].values[50]).toBe(1000);
    expect(parseShape(null)).toEqual([]);
    expect(parseShape({ ranks: "x" })).toEqual([]);
  });
});

describe("線と軸", () => {
  it("欠測で線を切る（1点だけの区間も残す）", () => {
    const runs = runsOf([1, 2, null, 3, null, null, 4, 5]);
    expect(runs.map((r) => r.map((p) => p.i))).toEqual([[0, 1], [3], [6, 7]]);
  });

  it("軸の範囲は、出している順位の最大値と、最後に値のある点まで", () => {
    const a = { rank: "50" as const, final: 100, values: share((i) => (i <= 40 ? i : null)) };
    const b = { rank: "1000" as const, final: 10, values: share((i) => (i <= 45 ? 1 : null)) };
    expect(extentOf([a, b], 100)).toEqual({ maxValue: 40, xEnd: hourAt(45, 100) });
    expect(extentOf([b], 100)).toEqual({ maxValue: 1, xEnd: 90 });
    expect(extentOf([], 100)).toEqual({ maxValue: 0, xEnd: 100 });
  });

  it("経過日数の目盛りは、入る数に合わせて 1・2・3・5 日おき", () => {
    expect(dayTicks(198, 10).map((t) => t.label)).toEqual(["1日", "2日", "3日", "4日", "5日", "6日", "7日", "8日"]);
    expect(dayTicks(198, 5).map((t) => t.h)).toEqual([48, 96, 144, 192]);
    expect(dayTicks(198, 4).map((t) => t.h)).toEqual([72, 144]);
    expect(dayTicks(20, 4)).toEqual([]);
  });

  it("経過の書き方", () => {
    expect(elapsedLabel(0, 198)).toBe("0時間（経過 0%）");
    expect(elapsedLabel(25, 198)).toBe("4日と3時間（経過 50%）");
    expect(elapsedLabel(50, 192)).toBe("8日（経過 100%）");
  });
});

describe("縦軸", () => {
  it("上端は最大値を切りのいい間隔で切り上げ、目盛りは 3〜6 本", () => {
    expect(valueAxis(53_140_000)).toEqual({ top: 60_000_000, ticks: [0, 1e7, 2e7, 3e7, 4e7, 5e7, 6e7] });
    expect(valueAxis(96_660_000).top).toBe(100_000_000);
    expect(valueAxis(150_000_000)).toEqual({ top: 150_000_000, ticks: [0, 2.5e7, 5e7, 7.5e7, 1e8, 1.25e8, 1.5e8] });
    expect(valueAxis(7_230_000).top).toBe(7_500_000);
    for (const v of [1, 9, 12_345, 3e6, 4.1e7, 9.9e7, 2.2e8]) {
      const a = valueAxis(v);
      expect(a.top).toBeGreaterThanOrEqual(v);
      expect(a.ticks.length - 1).toBeGreaterThanOrEqual(3);
      expect(a.ticks.length - 1).toBeLessThanOrEqual(6);
      expect(a.ticks.at(-1)).toBeCloseTo(a.top);
    }
    expect(valueAxis(0)).toEqual({ top: 1, ticks: [0, 1] });
  });
});
