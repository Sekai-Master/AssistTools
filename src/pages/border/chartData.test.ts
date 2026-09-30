import { describe, expect, it } from "vitest";
import { niceCeil, parseHistory, shownRuns, timeTicks, visibleEnd, yTicks, yTop, type HistoryPoint } from "./chartData";

const H = 3_600_000;

describe("履歴の読み取り", () => {
  it("順位ごとに時刻順へ並べ、予測は出していた時点だけ持つ", () => {
    const raw = {
      eventId: 219,
      rows: [
        [2000, 0.2, [[50, 300, 900, 800, 1000, 1], [100, 200, null, null, null, 0]]],
        [1000, 0.1, [[50, 100, 700, 500, 900, 0]]],
      ],
    };
    const h = parseHistory(raw);
    expect(h.get(50)).toEqual([
      { t: 1000, progress: 0.1, current: 100, predicted: null, low: null, high: null },
      { t: 2000, progress: 0.2, current: 300, predicted: 900, low: 800, high: 1000 },
    ]);
    expect(h.get(100)).toEqual([{ t: 2000, progress: 0.2, current: 200, predicted: null, low: null, high: null }]);
  });

  it("壊れた行・欄は捨て、形が違えば空", () => {
    expect(parseHistory(null).size).toBe(0);
    expect(parseHistory({ rows: 3 }).size).toBe(0);
    const h = parseHistory({ rows: [null, [1, 0.1, "x"], [2, 0.2, [[50, "a"], [100, 5, null, null, null, 0]]]] });
    expect([...h.keys()]).toEqual([100]);
  });
});

describe("予測を出していた区間", () => {
  const p = (t: number, shown: boolean): HistoryPoint => ({
    t,
    progress: t / 10,
    current: t,
    predicted: shown ? 10 : null,
    low: shown ? 8 : null,
    high: shown ? 12 : null,
  });

  it("出していない点で区切る（間を線でつながない）", () => {
    const runs = shownRuns([p(1, false), p(2, true), p(3, true), p(4, false), p(5, true)]);
    expect(runs.map((r) => r.map((x) => x.t))).toEqual([[2, 3], [5]]);
  });

  it("1回も出していなければ空", () => {
    expect(shownRuns([p(1, false), p(2, false)])).toEqual([]);
  });
});

describe("縦軸", () => {
  it("上端は 1・2・2.5・5 の切りのいい値に切り上げる", () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(8_000_000)).toBe(10_000_000);
    expect(niceCeil(12_000_000)).toBe(20_000_000);
    expect(niceCeil(22_000_000)).toBe(25_000_000);
    expect(niceCeil(41_000_000)).toBe(50_000_000);
  });

  it("目盛りは上端を4つに割る", () => {
    expect(yTicks(20_000_000)).toEqual([0, 5_000_000, 10_000_000, 15_000_000, 20_000_000]);
  });

  it("上端は実測と、出していた予測の幅の上まで入れる", () => {
    const pts = [
      { t: 1, progress: 0.1, current: 3_000_000, predicted: null, low: null, high: null },
      { t: 2, progress: 0.2, current: 6_000_000, predicted: 30_000_000, low: 20_000_000, high: 41_000_000 },
    ];
    expect(yTop(pts)).toBe(50_000_000);
  });
});

describe("横軸", () => {
  // 9/30 15:00 JST 開始・246時間
  const start = Date.UTC(2026, 8, 30, 6, 0);
  const end = start + 246 * H;

  // ★ 最初から246時間を取ると、序盤は線が左端に潰れて縦棒に見えた（2026-09-30 の画面で確認）
  it("右端は最新の少し先まで。序盤は最低24時間、終盤は終了まで", () => {
    expect(visibleEnd(start, end, start + 2 * H)).toBe(start + 24 * H);
    expect(visibleEnd(start, end, start + 48 * H)).toBe(start + 48 * H + 0.3 * 48 * H);
    expect(visibleEnd(start, end, start + 240 * H)).toBe(end);
  });

  it("日本時間にそろえ、0時は日付・それ以外は時で書く", () => {
    const ticks = timeTicks(start, start + 24 * H, 5);
    expect(ticks.map((t) => t.label)).toEqual(["18時", "10/1", "6時", "12時"]);
  });

  it("ラベルが多すぎれば間隔を広げる", () => {
    const ticks = timeTicks(start, end, 6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.every((t) => /^\d+\/\d+$/.test(t.label))).toBe(true);
  });
});
