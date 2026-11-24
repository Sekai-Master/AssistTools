import { describe, expect, it } from "vitest";
import { isUntilEnd, resolveFitToEnd } from "./fitToEnd";
import { restUntilEnd } from "./restUntilEnd";
import { type Segment, simulateTimeline } from "./timeline";

const MULTI = 54; // みんなでライブのロス（秒）
const SOLO = 32; // ひとりでライブのロス（秒）

const play = (minutes: number, id = `p${minutes}`): Segment => ({
  id,
  kind: "play",
  songId: "074",
  title: "独りんぼエンヴィー",
  jacketLink: "jacket_s_074.webp",
  refreshConstant: 84,
  songLengthSec: 74.8,
  minutes,
});
const rest = (minutes: number, id = `r${minutes}`): Segment => ({ id, kind: "rest", minutes });
const autoRest = (id = "auto"): Segment => ({ id, kind: "rest", minutes: 30, fitToEnd: true });
const endPlay = (): Segment => ({ ...(play(60, "end") as Extract<Segment, { kind: "play" }>), untilEnd: true });

const opts = (minutesToEnd: number | null, startPercent = 70, overheadSec = MULTI, startDecayProgress = 0) => ({
  startPercent,
  overheadSec,
  startDecayProgress,
  minutesToEnd,
});
/** 解いた写しを積んだ結果。 */
const run = (segs: Segment[], o: ReturnType<typeof opts>) => {
  const fit = resolveFitToEnd(segs, o);
  return { fit, r: simulateTimeline(fit.segments, o.startPercent, o.overheadSec, o.startDecayProgress) };
};
const minutesOf = (segs: Segment[], id: string) => segs.find((g) => g.id === id)!.minutes;

describe("イベ乙まで（最後の稼働）", () => {
  it("自動も イベ乙までも使っていなければ、そのまま（off）", () => {
    const segs = [play(60), rest(30)];
    const fit = resolveFitToEnd(segs, opts(300));
    expect(fit.status).toBe("off");
    expect(fit.segments).toEqual(segs);
  });

  it("最後の稼働をイベ乙までにすると、ほかを積んだ後の残りを走る", () => {
    const { fit, r } = run([play(60), rest(30), endPlay()], opts(300));
    expect(fit.status).toBe("solved");
    expect(minutesOf(fit.segments, "end")).toBe(210);
    expect(r.totalMinutes).toBe(300);
  });

  it("最後でない稼働の「イベ乙まで」は効かない（時間で積む）", () => {
    const segs = [endPlay(), rest(30)];
    expect(isUntilEnd(segs, 0)).toBe(false);
    const fit = resolveFitToEnd(segs, opts(300));
    expect(fit.status).toBe("off");
    expect(minutesOf(fit.segments, "end")).toBe(60);
  });

  it("自動が無ければ、100% を越えてもそのまま走る（ムダとして出る）", () => {
    const { r } = run([endPlay()], opts(2000, 90));
    expect(r.finalPercent).toBe(100);
    expect(r.totalWastedMinutes).toBeGreaterThan(0);
  });
});

describe("自動の休憩（1 つ）を解く", () => {
  /** 自動のすぐ後が最後の稼働で、休憩中に 0% で下げ止まらなければ、restUntilEnd.ts（閉じた式）の合計の休憩と同じ分になる */
  it.each([
    { g0: 70, p: 0, t: 600, oh: MULTI },
    { g0: 70, p: 0, t: 600, oh: SOLO },
    { g0: 70, p: 20, t: 600, oh: MULTI },
    { g0: 92.5, p: 7, t: 1200, oh: SOLO },
    { g0: 50, p: 0, t: 300, oh: MULTI },
  ])("G0=$g0% 繰り越し $p 分 残り $t 分 ロス $oh 秒: restUntilEnd と同じ分", ({ g0, p, t, oh }) => {
    const o = opts(t, g0, oh, p);
    const { fit, r } = run([autoRest(), endPlay()], o);
    const closed = restUntilEnd({
      startPercent: g0,
      decayProgressMin: p,
      minutesLeft: t,
      refreshConstant: 84,
      songLengthSec: 74.8,
      overheadSec: oh,
    })!;
    expect(fit.status).toBe("solved");
    expect(minutesOf(fit.segments, "auto")).toBe(closed.kind === "noRest" ? 0 : closed.restMinutes);
    expect(r.totalMinutes).toBeCloseTo(t, 9);
    expect(r.points[1].wastedMinutes).toBe(0);
    expect(r.finalPercent).toBeLessThanOrEqual(100);
  });

  it("低いゲージで自動の休憩を取ると 0% で下げ止まるので、restUntilEnd より長い（置いた場所どおりに数える）", () => {
    const o = opts(2400, 35.5, SOLO, 7);
    const { fit, r } = run([autoRest(), endPlay()], o);
    const closed = restUntilEnd({
      startPercent: 35.5,
      decayProgressMin: 7,
      minutesLeft: 2400,
      refreshConstant: 84,
      songLengthSec: 74.8,
      overheadSec: SOLO,
    })!;
    expect(closed.kind).toBe("rest");
    expect(minutesOf(fit.segments, "auto")).toBeGreaterThan(closed.kind === "rest" ? closed.restMinutes : 0);
    expect(r.points[0].endPercent).toBe(0);
    expect(r.points[1].wastedMinutes).toBe(0);
    expect(r.finalPercent).toBeLessThanOrEqual(100);
  });

  it("寝る時間などを時間で固定し、間の休憩 1 つを自動に: イベ乙で 100% 以下、1 分短いと頭打ち（いちばん短い）", () => {
    for (const oh of [MULTI, SOLO]) {
      const segs = [play(120), rest(480, "sleep"), play(180), autoRest(), endPlay()];
      const o = opts(5760, 70, oh);
      const { fit, r } = run(segs, o);
      const auto = minutesOf(fit.segments, "auto");
      expect(fit.status).toBe("solved");
      expect(auto).toBeGreaterThan(0);
      expect(r.totalMinutes).toBeCloseTo(5760, 9);
      expect(r.points[4].wastedMinutes).toBe(0);
      expect(r.finalPercent).toBeLessThanOrEqual(100);
      // 1 分短くすると、最後の稼働が 100% で頭打ちになる
      const shorter = segs.map((g) =>
        g.id === "auto" ? { ...g, minutes: auto - 1, fitToEnd: undefined } : g.id === "end" ? { ...g, untilEnd: undefined } : g,
      );
      const left = 5760 - simulateTimeline(shorter.slice(0, 4), 70, oh).totalMinutes;
      const s = simulateTimeline(
        shorter.map((g) => (g.id === "end" ? { ...g, minutes: left } : g)),
        70,
        oh,
      );
      expect(s.points[4].wastedMinutes).toBeGreaterThan(0);
    }
  });

  it("ひとりでライブ（ロスが小さく速く上がる）の方が、自動の休憩は長い", () => {
    const segs = [play(120), rest(480, "sleep"), autoRest(), endPlay()];
    const multi = minutesOf(resolveFitToEnd(segs, opts(5760, 70, MULTI)).segments, "auto");
    const solo = minutesOf(resolveFitToEnd(segs, opts(5760, 70, SOLO)).segments, "auto");
    expect(solo).toBeGreaterThan(multi);
  });

  it("繰り越しタイマー: 開始時の進捗 20 分なら、最初の段が 20 分早く来るぶん短い", () => {
    const segs = [autoRest(), endPlay()];
    const fresh = minutesOf(resolveFitToEnd(segs, opts(600, 70, MULTI, 0)).segments, "auto");
    const carried = minutesOf(resolveFitToEnd(segs, opts(600, 70, MULTI, 20)).segments, "auto");
    expect(fresh - carried).toBe(20);
  });

  it("繰り越し: 前の休憩（時間）の進捗も、稼働を挟んで自動の休憩に効く", () => {
    const a = minutesOf(resolveFitToEnd([rest(20, "r1"), play(60), autoRest(), endPlay()], opts(900)).segments, "auto");
    const b = minutesOf(resolveFitToEnd([rest(30, "r1"), play(60), autoRest(), endPlay()], opts(900)).segments, "auto");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it("届かない（休まず走っても 100% に届かない）なら、自動は 0 分", () => {
    const { fit, r } = run([autoRest(), endPlay()], opts(120, 0));
    expect(fit.status).toBe("solved");
    expect(minutesOf(fit.segments, "auto")).toBe(0);
    expect(r.finalPercent).toBeLessThan(100);
  });
});

describe("解けないとき", () => {
  it("自動が 2 つ以上: どれも 0 分（イベ乙までは残りを走る）", () => {
    const segs = [autoRest("a1"), play(60), autoRest("a2"), endPlay()];
    const fit = resolveFitToEnd(segs, opts(600));
    expect(fit.status).toBe("many");
    expect(minutesOf(fit.segments, "a1")).toBe(0);
    expect(minutesOf(fit.segments, "a2")).toBe(0);
    expect(minutesOf(fit.segments, "end")).toBe(540);
  });

  it("自動はあるが最後が「イベ乙まで」の稼働でない: 自動は 0 分", () => {
    const fit = resolveFitToEnd([autoRest(), play(60)], opts(600));
    expect(fit.status).toBe("needEnd");
    expect(minutesOf(fit.segments, "auto")).toBe(0);
  });

  it("イベ乙の時刻が分からない: 自動もイベ乙までも 0 分", () => {
    const fit = resolveFitToEnd([play(60), autoRest(), endPlay()], opts(null));
    expect(fit.status).toBe("noEnd");
    expect(minutesOf(fit.segments, "auto")).toBe(0);
    expect(minutesOf(fit.segments, "end")).toBe(0);
  });

  it("積んだブロックだけでイベ乙を過ぎる: 自動もイベ乙までも 0 分", () => {
    const fit = resolveFitToEnd([play(600), autoRest(), endPlay()], opts(300));
    expect(fit.status).toBe("past");
    expect(minutesOf(fit.segments, "auto")).toBe(0);
    expect(minutesOf(fit.segments, "end")).toBe(0);
  });
});
