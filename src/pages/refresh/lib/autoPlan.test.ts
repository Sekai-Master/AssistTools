import { describe, expect, it } from "vitest";
import {
  type AutoBlock,
  type AutoRuntime,
  gameDayIndex,
  planAuto,
  playsFittingIn,
} from "./autoPlan";

/** 初音天地開闢神話（182.4秒）＋オートのロス42.6秒 = 225秒。 */
const CYCLE = 225;

const rt = (over: Partial<AutoRuntime> = {}): AutoRuntime => ({
  cycleSec: CYCLE,
  ptPerPlay: 69_125,
  taki: 10,
  dailyCap: 99,
  usedToday: 0,
  startMinuteOfDay: 10 * 60,
  ...over,
});

const rest = (index: number, startMinute: number, restMinutes: number, requested: number | null): AutoBlock => ({
  index,
  startMinute,
  restMinutes,
  requested,
});

describe("gameDayIndex — 4:00区切り", () => {
  it("4:00 で日が変わる（深夜は前日の扱い）", () => {
    expect(gameDayIndex(4 * 60)).toBe(0);
    expect(gameDayIndex(4 * 60 - 1)).toBe(-1);
    expect(gameDayIndex(23 * 60)).toBe(0);
    // 26:00・28:00（＝翌 02:00・04:00）。26時はまだ同じクォータ日、28時から翌日。
    expect(gameDayIndex(26 * 60)).toBe(0);
    expect(gameDayIndex(28 * 60)).toBe(1);
  });
});

describe("playsFittingIn — 休憩の尺", () => {
  it("回しきれない最後の1回は数えない", () => {
    expect(playsFittingIn(60, CYCLE)).toBe(16); // 3600/225 = 16.0
    expect(playsFittingIn(59, CYCLE)).toBe(15);
    expect(playsFittingIn(0, CYCLE)).toBe(0);
    expect(playsFittingIn(60, 0)).toBe(0);
  });
});

describe("planAuto — 弾く3つ", () => {
  it("休憩より長いオートは休憩の尺で切る", () => {
    const r = planAuto([rest(0, 0, 60, 30)], rt());
    expect(r.blocks[0].plays).toBe(16);
    expect(r.blocks[0].droppedByTime).toBe(14);
    expect(r.blocks[0].droppedByCap).toBe(0);
  });

  it("回数を指定しなければ休憩の尺いっぱいまで回す", () => {
    const r = planAuto([rest(0, 0, 60, null)], rt());
    expect(r.blocks[0].plays).toBe(16);
    expect(r.blocks[0].droppedByTime).toBe(0);
  });

  it("パス無し（1日10回）は10回で止まる", () => {
    const r = planAuto([rest(0, 0, 300, null)], rt({ dailyCap: 10 }));
    expect(r.blocks[0].plays).toBe(10);
    expect(r.blocks[0].droppedByCap).toBeGreaterThan(0);
    expect(r.totalPoints).toBe(10 * 69_125);
    expect(r.totalLb).toBe(100);
  });

  it("今日すでに回したぶんは残り回数から引く", () => {
    const r = planAuto([rest(0, 0, 600, null)], rt({ usedToday: 90 }));
    expect(r.blocks[0].plays).toBe(9);
    expect(r.byDay[0]).toEqual({ day: 0, plays: 9, cap: 9 });
  });

  it("複数の休憩でも1日ぶんのクォータを共有する", () => {
    const r = planAuto(
      [rest(0, 0, 60, null), rest(1, 120, 60, null)],
      rt({ dailyCap: 20 }),
    );
    expect(r.blocks[0].plays).toBe(16);
    expect(r.blocks[1].plays).toBe(4); // 残り4回
    expect(r.totalPlays).toBe(20);
  });
});

describe("planAuto — 4:00 の罠", () => {
  /**
   * 03:00 から5時間の休憩でオートを回し続けると、4:00 で日が変わる。
   * 前日ぶんの余りは消え、4:00 以降は翌日のクォータを食う（spec §6）。
   */
  it("4:00 をまたぐと、そこから翌日ぶんのクォータを食う", () => {
    const r = planAuto([rest(0, 0, 300, 40)], rt({ dailyCap: 10, startMinuteOfDay: 3 * 60 }));
    const b = r.blocks[0];
    expect(b.crossesReset).toBe(true);
    expect(b.plays).toBe(20); // 前日10 + 当日10
    expect(b.playsOnNextDay).toBe(10);
    expect(b.droppedByCap).toBe(20);
    expect(r.byDay).toEqual([
      { day: -1, plays: 10, cap: 10 },
      { day: 0, plays: 10, cap: 10 },
    ]);
  });

  it("4:00 前に終われば罠は発火しない", () => {
    const r = planAuto([rest(0, 0, 50, null)], rt({ dailyCap: 99, startMinuteOfDay: 3 * 60 }));
    expect(r.blocks[0].crossesReset).toBe(false);
    expect(r.blocks[0].playsOnNextDay).toBe(0);
  });

  it("99回は約6.2時間かかる（＝1日の窓に収まるかの目安）", () => {
    const hours = (99 * CYCLE) / 3600;
    expect(hours).toBeCloseTo(6.19, 2);
    const r = planAuto([rest(0, 0, 6 * 60, null)], rt({ startMinuteOfDay: 10 * 60 }));
    expect(r.blocks[0].plays).toBe(96); // 6時間では99回に届かない
  });
});
