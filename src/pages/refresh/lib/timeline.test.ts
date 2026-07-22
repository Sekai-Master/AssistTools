import { describe, expect, it } from "vitest";
import { type Segment, simulateTimeline } from "./timeline";

const OH = 54; // オーバーヘッド既定
const SEC_PER_PLAY = 74.8 + OH; // エビ1周の実所要秒

const play = (minutes: number): Segment => ({
  id: "p",
  kind: "play",
  songId: "074",
  title: "独りんぼエンヴィー",
  jacketLink: "jacket_s_074.webp",
  refreshConstant: 84,
  songLengthSec: 74.8,
  minutes,
});
const rest = (minutes: number): Segment => ({ id: "r", kind: "rest", minutes });

describe("simulateTimeline（時間指定）", () => {
  it("60分プレイ: 分×ペースで周回数を逆算しゲージ増加", () => {
    const r = simulateTimeline([play(60)], 0, OH);
    expect(r.totalMinutes).toBe(60);
    const plays = (60 * 60) / SEC_PER_PLAY; // ≈27.95
    expect(r.points[0].plays).toBeCloseTo(plays, 3);
    expect(r.finalPercent).toBeCloseTo((plays * 84 * 157) / 66000, 3);
    expect(r.totalWasted).toBe(0);
  });

  it("休憩でゲージ減少（30分ごと8.33%）", () => {
    // 120分プレイで約11%まで上げてから休憩（0%クランプに当たらない量）
    const r = simulateTimeline([play(120), rest(30)], 0, OH);
    const afterPlay = r.points[0].endPercent;
    const afterRest = r.points[1].endPercent;
    expect(afterPlay - afterRest).toBeCloseTo((550000 / 6600000) * 100, 3);
  });

  it("単発の30分未満休憩は減らない", () => {
    const r = simulateTimeline([play(60), rest(29)], 0, OH);
    expect(r.points[1].endPercent).toBeCloseTo(r.points[0].endPercent, 6);
  });

  it("繰り越し: 分割した休憩でも累計30分で減少する", () => {
    // 20分休憩→20分休憩 = 計40分 → 1回減少（独立floorなら0回だった）
    const split = simulateTimeline([play(120), rest(20), rest(20)], 0, OH);
    const once = simulateTimeline([play(120), rest(30)], 0, OH);
    const drop = (550000 / 6600000) * 100;
    // 40分ぶんの繰り越しで1回減少している
    expect(split.points[0].endPercent - split.finalPercent).toBeCloseTo(drop, 6);
    expect(once.points[0].endPercent - once.finalPercent).toBeCloseTo(drop, 6);
    // 余り10分が次に繰り越されている
    expect(split.points[2].decayProgressMin).toBeCloseTo(10, 6);
  });

  it("繰り越し: プレイを挟んでも休憩進捗は引き継がれる（ユーザー要望の核）", () => {
    // 20分休憩→プレイ→20分休憩 = 計40分の休憩 → 1回減少
    const r = simulateTimeline([play(120), rest(20), play(30), rest(20)], 0, OH);
    const beforeRests = r.points[0].endPercent; // 最初のプレイ後
    // プレイ分の増加を差し引いて、休憩で1回ぶん減っていること
    const drop = (550000 / 6600000) * 100;
    // 2回目プレイ後→最終(最後の休憩後)で減少が1回入る
    expect(r.points[2].endPercent - r.finalPercent).toBeCloseTo(drop, 6);
    expect(beforeRests).toBeGreaterThan(0);
  });

  it("長時間プレイで100%超過分をムダ（周回・時間）として検出", () => {
    // 0%から1200分エビ = 約559周だが501周で100%、残りはムダ
    const r = simulateTimeline([play(1200)], 0, OH);
    expect(r.finalPercent).toBe(100);
    const plays = (1200 * 60) / SEC_PER_PLAY;
    const effective = 6_600_000 / (84 * 157);
    expect(r.totalWasted).toBeCloseTo(plays - effective, 2);
    expect(r.points[0].wastedMinutes).toBeCloseTo(((plays - effective) * SEC_PER_PLAY) / 60, 2);
  });

  it("恒等式: 各ブロックの endPercent が次の startPercent と一致", () => {
    const r = simulateTimeline([play(60), rest(30), play(30)], 5, OH);
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].startPercent).toBeCloseTo(r.points[i - 1].endPercent, 9);
    }
    expect(r.points[0].startPercent).toBeCloseTo(5, 9);
  });

  it("空プランは0", () => {
    const r = simulateTimeline([], 12, OH);
    expect(r.totalMinutes).toBe(0);
    expect(r.finalPercent).toBeCloseTo(12, 9);
  });
});
