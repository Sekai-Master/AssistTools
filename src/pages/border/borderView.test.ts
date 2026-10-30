import { describe, expect, it } from "vitest";
import { formatJst, hiddenReason, isStale, phaseOf, recordRows, referenceDetail, type Report, type Snapshot } from "./borderView";

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

describe("referenceDetail（参考値の説明。#175）", () => {
  const e102 = { ...snap.event, durationHours: 102 };
  const e246 = { ...snap.event, durationHours: 246 };
  const thin = { duration: 102, samples: 1, latestEventId: 221, weight: 0.3 };

  it("同じ長さの回が少ない（thin）: 回数と、直近の回・ほかの回を混ぜた比率を書く", () => {
    const t = referenceDetail({ event: e102, extrapolatedFrom: 150, thin, referenceSource: "thin" });
    expect(t).toBe(
      "このイベントは 102 時間で、過去に同じ長さの回が 1 回しかありません。同じ長さの直近の回（第221回）の伸び方を3割、ほかの回の伸び方を7割で混ぜて出しているので、大きく外れることがあります",
    );
    expect(t).not.toContain("借り");
  });

  it("過去に無い長さで率モデルを混ぜた（rate）: 「借りて」と書かず、全イベントの伸び方から作った形を混ぜたと書く", () => {
    const t = referenceDetail({ event: e246, extrapolatedFrom: 198, thin: null, referenceSource: "rate" });
    expect(t).toBe(
      "このイベントは 246 時間で、過去に同じ長さの回がありません。いちばん近い 198 時間の回の伸び方と、これまでの全イベントの伸び方から作った形を混ぜて出しているので、大きく外れることがあります",
    );
  });

  it("近い長さの表をそのまま借りた（borrow）・referenceSource の無い古い出力: いまの文面のまま", () => {
    const borrow = "このイベントは 246 時間で、過去に同じ長さの回がありません。いちばん近い 198 時間の回の伸び方を借りて出しているので、大きく外れることがあります";
    expect(referenceDetail({ event: e246, extrapolatedFrom: 198, thin: null, referenceSource: "borrow" })).toBe(borrow);
    expect(referenceDetail({ event: e246, extrapolatedFrom: 198 })).toBe(borrow);
    // 古い出力でも thin があれば thin の文面
    expect(referenceDetail({ event: e102, extrapolatedFrom: 150, thin })).toContain("1 回しかありません");
  });

  it("参考値でなければ null", () => {
    expect(referenceDetail({ event: e246, extrapolatedFrom: null, thin: null, referenceSource: null })).toBeNull();
    expect(referenceDetail(snap)).toBeNull();
  });
});

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

  // ★ モデルがまだ無い（立ち上げ直後など）ときに「外れ幅が大きすぎる」と言わない
  it("出し始めが分からないときは理由を決めつけない", () => {
    expect(hiddenReason({ showFrom: null }, 0.5)).toBe("予測はまだ出していません");
  });

  // ★ 経過4% は長さで時刻が変わる（150時間なら約6時間、246時間なら約10時間）
  it("イベントを渡すと、出し始める時刻を添える", () => {
    const e150 = { startAt: START, aggregateAt: START + 150 * H - 60_000 };
    expect(hiddenReason({ showFrom: 0.04 }, 0.01, e150)).toBe("予測は経過4%（10/1 21:00ごろ）から出します");
    const e246 = { startAt: START, aggregateAt: START + 246 * H - 60_000 };
    expect(hiddenReason({ showFrom: 0.04 }, 0.01, e246)).toBe("予測は経過4%（10/2 00:50ごろ）から出します");
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
