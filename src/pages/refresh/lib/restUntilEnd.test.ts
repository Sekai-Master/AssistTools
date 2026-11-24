/**
 * イベ乙までに、あと合計何分休めば、残りを走りっぱなしで終了時刻に 100% ちょうど（以下）になるか（restUntilEnd）。
 *
 * ★ 縛ること
 *   - 休まなくても 100% に届かないときは「休まず」と終わりの%
 *   - 段の境目: ちょうど R(n) で 100% になる入力は「ちょうど」。少し上なら段の刻みで 100% 未満、少し下なら 1 分多く休んで「ちょうど」
 *   - 繰り越しのタイマー（次の回復まで）で、最初の段に要る休憩が縮む
 *   - ひとりでライブ／みんなでライブ（周回の速さ）で答えが変わる
 *   - 終了まで 30 分未満でも答えが出る（段が来なくても、100% で止まって休めばよい）
 *   - 終了時刻が過ぎていれば出さない
 *   - 答えの休憩を timeline.ts（simulateTimeline）に積むと、同じ終わりの%になり、100% 超えのムダが出ない
 */
import { describe, expect, it } from "vitest";
import { GAUGE_SPEC } from "./gaugeModel";
import { OVERHEAD_SEC } from "../../../lib/overhead";
import { type Segment, minutesToTarget, simulateTimeline } from "./timeline";
import {
  type RestUntilEnd,
  type RestUntilEndInput,
  clockToMs,
  formatEventEnd,
  restUntilEnd,
  restUntilEndText,
} from "./restUntilEnd";

/**
 * 1 周 2 分（曲 100 秒＋ロス 20 秒）で 1 回 +1%（内部 66,000）の曲。稼働は 1 分あたり +0.5%。
 * 一段（8.33%）は稼働にして 16.67 分ぶん。
 */
const RC = 66_000 / GAUGE_SPEC.liveCoef;
const base: Omit<RestUntilEndInput, "startPercent" | "decayProgressMin" | "minutesLeft"> = {
  refreshConstant: RC,
  songLengthSec: 100,
  overheadSec: 20,
};
const run = (startPercent: number, minutesLeft: number, decayProgressMin = 0) =>
  restUntilEnd({ ...base, startPercent, minutesLeft, decayProgressMin });

/** 内部値 → 表示%（切り捨て前） */
const pct = (internal: number) => (internal / GAUGE_SPEC.max) * 100;

describe("休まなくても届かない", () => {
  it("50% から 60 分走っても 80% なら「休まず」、終わりは 80%", () => {
    const r = run(50, 60);
    expect(r).toEqual({ kind: "noRest", finalPercent: 80 });
  });

  it("ちょうど 100% で終わる（休まず走り切れる）も「休まず」", () => {
    const r = run(70, 60);
    expect(r?.kind).toBe("noRest");
    expect(r?.kind === "noRest" && r.finalPercent).toBeCloseTo(100, 9);
  });
});

describe("段の境目", () => {
  // 120 分のうち 30 分休んで（1 段）90 分走ると、ちょうど 100% で終わる開始の内部値: 100% + 一段 − 90 分ぶん
  const boundary = pct(GAUGE_SPEC.max + GAUGE_SPEC.decayPer30min - 33_000 * 90);

  it("ちょうど 30 分（1 段）で 100% になる入力は「30 分休めば 100% ちょうど」", () => {
    const r = run(boundary, 120);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 30, ticks: 1, exact: true });
    expect(r?.kind === "rest" && r.finalPercent).toBeCloseTo(100, 6);
  });

  it("少し下（−0.1%）は段の刻みでちょうどにならない。30 分休んで 99.9%", () => {
    const r = run(boundary - 0.1, 120);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 30, ticks: 1, exact: false });
    expect(r?.kind === "rest" && r.finalPercent).toBeCloseTo(99.9, 6);
  });

  it("少し上（+0.1%）は 30.2 分でちょうど。分は切り上げて 31 分", () => {
    const r = run(boundary + 0.1, 120);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 31, ticks: 1, exact: true });
  });
});

describe("繰り越しのタイマー", () => {
  it("繰り越し無し: 90% から 60 分。1 段に 30 分要り、30 分休むと段の刻みで 96.6%", () => {
    const r = run(90, 60, 0);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 30, ticks: 1, exact: false });
    // 90 + 0.5 × 30 − 8.33 = 96.67
    expect(r?.kind === "rest" && r.finalPercent).toBeCloseTo(90 + 15 - pct(GAUGE_SPEC.decayPer30min), 6);
  });

  it("20 分繰り越していれば 10 分で 1 段来るので、24 分（23.3 分の切り上げ）休めば 100% ちょうど", () => {
    const r = run(90, 60, 20);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 24, ticks: 1, exact: true });
  });

  it("「次の回復まで 0 分」（繰り越し 30）は 1 分未満の残りとみなし、最初の段に 1 分休む（0 分とは出さない）", () => {
    const r = run(99, 15, 30);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 1, ticks: 1, exact: false });
    // 99 + 0.5 × 14 − 8.33
    expect(r?.kind === "rest" && r.finalPercent).toBeCloseTo(99 + 7 - pct(GAUGE_SPEC.decayPer30min), 6);
  });
});

describe("ひとりでライブ／みんなでライブ", () => {
  // 独りんぼエンヴィー（定数 84・74.8 秒）。70% から、終了まで 5 日（7,200 分）
  const envy = (overheadSec: number) =>
    restUntilEnd({
      startPercent: 70,
      decayProgressMin: 0,
      minutesLeft: 7_200,
      refreshConstant: 84,
      songLengthSec: 74.8,
      overheadSec,
    });

  it("ロスの短いひとりでライブ（速い）の方が多く休む", () => {
    const solo = envy(OVERHEAD_SEC.solo);
    const multi = envy(OVERHEAD_SEC.multi);
    expect(solo?.kind).toBe("rest");
    expect(multi?.kind).toBe("rest");
    if (solo?.kind !== "rest" || multi?.kind !== "rest") return;
    expect(solo.restMinutes).toBeGreaterThan(multi.restMinutes);
    expect(solo.finalPercent).toBeLessThanOrEqual(100);
    expect(multi.finalPercent).toBeLessThanOrEqual(100);
  });
});

describe("終了まで 30 分未満", () => {
  it("99% で残り 20 分・繰り越し無し: 段は来ないが、18 分休めば（2 分走って止まれば）100% ちょうど", () => {
    const r = run(99, 20, 0);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 18, ticks: 0, exact: true });
  });

  it("15 分繰り越していれば 15 分で 1 段来る。休みは 15 分で済み、終わりは段の刻みで 93.1%", () => {
    const r = run(99, 20, 15);
    expect(r).toMatchObject({ kind: "rest", restMinutes: 15, ticks: 1, exact: false });
    expect(r?.kind === "rest" && r.finalPercent).toBeCloseTo(99 + 2.5 - pct(GAUGE_SPEC.decayPer30min), 6);
  });
});

describe("終了時刻が過ぎている・計算できない", () => {
  it("残りが 0 分以下なら出さない", () => {
    expect(run(50, 0)).toBeNull();
    expect(run(50, -30)).toBeNull();
  });

  it("曲の定数・長さが無ければ出さない", () => {
    expect(restUntilEnd({ ...base, refreshConstant: 0, startPercent: 50, minutesLeft: 60, decayProgressMin: 0 })).toBeNull();
    expect(
      restUntilEnd({ ...base, songLengthSec: 0, overheadSec: 0, startPercent: 50, minutesLeft: 60, decayProgressMin: 0 }),
    ).toBeNull();
  });
});

describe("timeline.ts と突き合わせる", () => {
  const play = (minutes: number): Segment => ({
    id: `p${minutes}`,
    kind: "play",
    songId: "x",
    title: "x",
    jacketLink: "",
    refreshConstant: RC,
    songLengthSec: 100,
    minutes,
  });
  const rest = (minutes: number): Segment => ({ id: `r${minutes}`, kind: "rest", minutes });

  /** 100% まで走る → 答えの休憩をまとめて取る → 残りを走る、を積む */
  function simulate(startPercent: number, minutesLeft: number, carry: number, r: RestUntilEnd) {
    if (r.kind !== "rest") throw new Error("rest でない");
    const toFull = Math.min(
      minutesLeft - r.restMinutes,
      minutesToTarget((startPercent / 100) * GAUGE_SPEC.max, 100, RC, 100, 20),
    );
    const segs = [play(toFull), rest(r.restMinutes), play(minutesLeft - r.restMinutes - toFull)];
    return simulateTimeline(segs, startPercent, 20, carry);
  }

  it.each([
    [70, 600, 0],
    [70, 600, 20],
    [10, 300, 5],
    [95, 45, 0],
  ])("開始 %d%%・残り %d 分・繰り越し %d 分", (start, left, carry) => {
    const r = run(start, left, carry);
    expect(r?.kind).toBe("rest");
    if (r?.kind !== "rest") return;
    const sim = simulate(start, left, carry, r);
    expect(sim.totalMinutes).toBeCloseTo(left, 9);
    expect(sim.finalPercent).toBeCloseTo(r.finalPercent, 6);
    expect(sim.finalPercent).toBeLessThanOrEqual(100 + 1e-9);
    expect(sim.totalWasted).toBeLessThan(1e-6);
    // 1 分少なく休むと、100% を超えてムダが出る（いちばん少ない休憩）
    const less = simulate(start, left, carry, { ...r, restMinutes: r.restMinutes - 1 });
    expect(less.totalWasted > 1e-6 || less.finalPercent < sim.finalPercent - 1).toBe(true);
  });
});

describe("1 行の文", () => {
  const end = formatEventEnd(Date.UTC(2026, 10, 29, 11, 59, 59)); // 11/29 20:59:59 JST

  it("イベ乙の時刻は日本時間の「月/日 時:分」", () => {
    expect(end).toBe("11/29 20:59");
  });

  it("ちょうど・段の刻み・休まず", () => {
    expect(restUntilEndText({ kind: "rest", restMinutes: 150, ticks: 5, exact: true, finalPercent: 99.98 }, end)).toBe(
      "イベ乙（11/29 20:59）までに、あと合計 2時間30分休めば 100% ちょうど",
    );
    expect(restUntilEndText({ kind: "rest", restMinutes: 30, ticks: 1, exact: false, finalPercent: 98.96 }, end)).toBe(
      "イベ乙（11/29 20:59）までに、あと合計 30分休めば 98.9%",
    );
    expect(restUntilEndText({ kind: "noRest", finalPercent: 87.35 }, end)).toBe("休まず走り切れます（イベ乙で 87.3%）");
  });
});

describe("時計の時刻 → 日時（周回プランの開始時刻）", () => {
  const at = (h: number, m: number, day = 24) => new Date(2026, 10, day, h, m).getTime();

  it("いまより後（または 1 時間前まで）の、いちばん近い日のその時刻", () => {
    expect(clockToMs(21 * 60, at(20, 50))).toBe(at(21, 0));
    expect(clockToMs(20 * 60, at(20, 50))).toBe(at(20, 0)); // 50 分前は今日
    expect(clockToMs(15 * 60, at(20, 50))).toBe(at(15, 0, 25)); // 5 時間 50 分前は明日の予定とみなす
    expect(clockToMs(0, at(23, 55))).toBe(at(0, 0, 25)); // 23:55 に開いた既定の 00:00 は明日
    expect(clockToMs(23 * 60, at(8, 0))).toBe(at(23, 0));
  });
});
