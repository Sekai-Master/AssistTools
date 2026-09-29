import { describe, expect, it } from "vitest";
import { formatJst, hiddenReason, isStale, phaseOf, recordRows, type Report, type Snapshot } from "./borderView";

const H = 3_600_000;
const START = Date.UTC(2026, 9, 1, 6, 0); // 10/1 15:00 JST

const snap: Snapshot = {
  event: { id: 219, name: "x", type: "marathon", unit: "none", startAt: START, aggregateAt: START + 150 * H - 60_000, durationHours: 150 },
  checkedAt: START + 80 * H,
  sampleAt: START + 80 * H,
  progress: 80 / 150,
  modelVersion: "share-median-v1@e218",
  predicted: true,
  ranks: [],
};

describe("formatJst", () => {
  it("日本時間で月/日 時:分", () => {
    expect(formatJst(START)).toBe("10/1 15:00");
  });
});

describe("phaseOf / isStale", () => {
  it("集計時刻を過ぎたら終了扱い", () => {
    expect(phaseOf(snap, START + 100 * H)).toBe("running");
    expect(phaseOf(snap, START + 151 * H)).toBe("finished");
  });

  it("開催中に90分以上更新が止まっていたら注意を出す。終了後は出さない", () => {
    expect(isStale(snap, START + 81 * H)).toBe(false);
    expect(isStale(snap, START + 82 * H)).toBe(true);
    expect(isStale(snap, START + 160 * H)).toBe(false);
  });
});

describe("hiddenReason", () => {
  it("出し始める前は経過率を書き、出さない印（1 を超える値）のときは経過率として読まない", () => {
    expect(hiddenReason({ showFrom: 0.04 }, 0.02)).toBe("予測は経過4%から出します");
    expect(hiddenReason({ showFrom: 1.01 }, 0.5)).toBe("外れ幅が大きすぎるので、いまは予測を出していません");
    expect(hiddenReason({ showFrom: 0.04 }, 0.5)).toBe("外れ幅が大きすぎるので、いまは予測を出していません");
  });
});

describe("recordRows", () => {
  const report: Report = {
    eventId: 219,
    name: "x",
    unit: "none",
    durationHours: 150,
    startAt: START,
    aggregateAt: START + 150 * H - 60_000,
    generatedAt: "",
    modelVersions: ["v"],
    ranks: [
      {
        rank: 1000,
        final: 100,
        prospective: [
          { checkpoint: 0.5, progress: 0.49, modelVersion: "v", predicted: 90, low: 85, high: 95, error: -0.1, inBand: false, visible: true },
          { checkpoint: 0.85, progress: 0.84, modelVersion: "v", predicted: 98, low: 96, high: 101, error: -0.02, inBand: true, visible: true },
        ],
        replay: [{ p: 0.9, error: -0.03 }],
      },
      { rank: 2000, final: 50, prospective: [], replay: [{ p: 0.9, error: 0.01 }] },
    ],
  };

  it("経過85%の予測を代表にする。本番の予測が無い順位は再現誤差を出す", () => {
    const rows = recordRows(report);
    expect(rows[0]).toMatchObject({ rank: 1000, predicted: 98, error: -0.02, inBand: true });
    expect(rows[1]).toMatchObject({ rank: 2000, predicted: null, error: null, replayError: 0.01 });
  });
});
