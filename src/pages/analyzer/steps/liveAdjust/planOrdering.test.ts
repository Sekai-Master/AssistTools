import { describe, expect, it } from "vitest";
import type { MultiLivePlan, MultiLiveUnit } from "../../lib/multiLiveAdjust";
import { sortPlansByDuration } from "./planOrdering";

function unit(basePoint: number, count = 1): MultiLiveUnit {
  return { basePoint, liveBonus: 0, minScore: 0, maxScore: 19_999, pt: 1_000, count };
}

function plan(units: MultiLiveUnit[]): MultiLivePlan {
  const liveCount = units.reduce((s, u) => s + u.count, 0);
  return { units, liveCount, lbCost: 0, totalPt: liveCount * 1_000 };
}

describe("sortPlansByDuration", () => {
  it("演奏秒が判明しているプランを所要時間の昇順に並べる", () => {
    // 基礎点100=200秒(2回=400+overhead*2)・基礎点130=50秒(1回)。時間不明な基礎点は timeForBase が undefined。
    const timeForBase = (bp: number) => (bp === 100 ? 200 : bp === 130 ? 50 : undefined);
    const long = plan([unit(100, 2)]);
    const short = plan([unit(130, 1)]);
    const result = sortPlansByDuration([long, short], timeForBase);
    expect(result.map((r) => r.plan)).toEqual([short, long]);
  });

  it("所要時間が不明なプランは末尾に回す（順序は保持）", () => {
    const timeForBase = (bp: number) => (bp === 100 ? 100 : undefined);
    const known = plan([unit(100, 1)]);
    const unknownA = plan([unit(999, 1)]);
    const unknownB = plan([unit(998, 1)]);
    const result = sortPlansByDuration([unknownA, known, unknownB], timeForBase);
    expect(result.map((r) => r.plan)).toEqual([known, unknownA, unknownB]);
    expect(result[1].durationSec).toBeUndefined();
    expect(result[2].durationSec).toBeUndefined();
  });

  it("空配列は空配列を返す", () => {
    expect(sortPlansByDuration([], () => undefined)).toEqual([]);
  });
});
