import { describe, expect, it } from "vitest";
import { calculateUnitBasePt } from "../../analyzer/lib/mySekai";
import {
  MYSEKAI_FULL_HARVEST_MEMORI,
  computePlanPoints,
  mySekaiPoints,
  takiRate,
} from "./planPoints";
import { type Segment, simulateTimeline } from "./timeline";

const OH = 54;
const play = (minutes: number, taki?: number): Segment => ({
  id: `p${minutes}-${taki ?? "d"}`,
  kind: "play",
  songId: "074",
  title: "独りんぼエンヴィー",
  jacketLink: "jacket_s_074.webp",
  refreshConstant: 84,
  songLengthSec: 74.8,
  minutes,
  taki,
});

const cfg = {
  startPoints: 100_000_000,
  hourlyRate: 500_000,
  refTaki: 5,
  mySekaiUnitPt: 7_500,
};

describe("takiRate — 焚き数の倍率比", () => {
  it("基準と同じ焚き数なら時速そのまま", () => {
    expect(takiRate(500_000, 5, 5)).toBe(500_000);
  });

  it("10焚きは 35/25 倍", () => {
    expect(takiRate(500_000, 5, 10)).toBeCloseTo((500_000 * 35) / 25, 6);
  });
});

describe("mySekaiPoints — 採取の点数", () => {
  it("メモリ × 単価（0.1メモリ単位で畳む）", () => {
    expect(mySekaiPoints(1, 7_500)).toBe(7_500);
    expect(mySekaiPoints(89.5, 7_500)).toBe(671_250);
    // 0.2メモリの草花1本ぶんでも端数を落とさない
    expect(mySekaiPoints(0.2, 7_500)).toBe(1_500);
  });

  it("単価0（総合力・ボーナス未入力）なら0", () => {
    expect(mySekaiPoints(89.5, 0)).toBe(0);
    expect(mySekaiPoints(0, 7_500)).toBe(0);
  });

  /**
   * event214 の実測との突き合わせ（wl214/params.json の mysekai）。
   * 総合力33.6万・ボーナス821%・ブースト（×500）で 単価7,500・全回収671,000pt。
   * ここがズレたら、マイセカイの点数はどこかで壊れている。
   */
  it("実測アンカー: 総合力33.6万・821%・ワールドパスで 7,500pt/メモリ", () => {
    const unit = calculateUnitBasePt(336_000, 821, true);
    expect(unit).toBe(7_500);
    expect(mySekaiPoints(MYSEKAI_FULL_HARVEST_MEMORI, unit)).toBeCloseTo(671_000, -3);
  });
});

describe("computePlanPoints", () => {
  it("プレイは点数時速×実働時間、累積は起点から積む", () => {
    const r = simulateTimeline([play(60)], 0, OH);
    const rows = computePlanPoints(r, cfg);
    expect(rows[0].gained).toBe(500_000);
    expect(rows[0].cumulative).toBe(100_500_000);
  });

  it("ゲージ100%到達後のムダ時間は加点しない", () => {
    const r = simulateTimeline([play(1200)], 0, OH);
    const rows = computePlanPoints(r, cfg);
    const effMin = 1200 - r.points[0].wastedMinutes;
    expect(r.points[0].wastedMinutes).toBeGreaterThan(0);
    expect(rows[0].gained).toBe(Math.round(500_000 * (effMin / 60)));
  });

  it("マイセカイは採取量×単価、休憩は0", () => {
    const segs: Segment[] = [
      { id: "m", kind: "mysekai", memori: 89.5, minutes: 15 },
      { id: "r", kind: "rest", minutes: 30 },
    ];
    const rows = computePlanPoints(simulateTimeline(segs, 50, OH), cfg);
    expect(rows[0].gained).toBe(671_250);
    expect(rows[1].gained).toBe(0);
    expect(rows[1].cumulative).toBe(rows[0].cumulative);
  });

  it("旧データ（スタミナ保存）のマイセカイも点数が入る", () => {
    const segs: Segment[] = [{ id: "m", kind: "mysekai", stamina: 30, minutes: 10 }];
    const rows = computePlanPoints(simulateTimeline(segs, 0, OH), cfg);
    // 30スタミナ = 6メモリ
    expect(rows[0].gained).toBe(45_000);
  });

  it("単価が0なら採取は0のまま（黙って偽の点数を出さない）", () => {
    const segs: Segment[] = [{ id: "m", kind: "mysekai", memori: 89.5, minutes: 15 }];
    const rows = computePlanPoints(simulateTimeline(segs, 0, OH), {
      ...cfg,
      mySekaiUnitPt: 0,
    });
    expect(rows[0].gained).toBe(0);
  });
});
