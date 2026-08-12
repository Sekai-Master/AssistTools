import { describe, expect, it } from "vitest";
import { LB_REGEN_MIN, PASS_LIMITS, playsUntilEmpty } from "./lbRun";

/** エビ（74.8秒）＋オートのロス33秒。 */
const CYCLE = 74.8 + 33;
const 既定 = PASS_LIMITS.none.lbCap; // 25

const run = (o: Partial<Parameters<typeof playsUntilEmpty>[0]> & { startLB: number; taki: number }) =>
  playsUntilEmpty({ cycleSec: CYCLE, regen: true, lbCap: 既定, ...o });

describe("playsUntilEmpty", () => {
  it("回復を数えないなら 所持 ÷ 焚き数 の切り捨て", () => {
    const r = run({ startLB: 25, taki: 5, regen: false });
    expect(r.plays).toBe(5);
    expect(r.leftover).toBe(0);
    expect(r.regained).toBe(0);
  });

  /** ★ 本題その1。残りが焚き数に足りないと、そこで止まって端数が残る。 */
  it("残りが焚き数を下回ったら止まり、端数が残る", () => {
    const r = run({ startLB: 22, taki: 5, regen: false });
    expect(r.plays).toBe(4);
    expect(r.leftover).toBe(2); // 2 は 5焚きに足りないので使えない
    expect(r.stoppedBy).toBe("lb");
  });

  /**
   * ★ 本題その2。上限（25）ちょうどから始めると、1回回した時点で上限を割るので
   *   そこから最後まで回復が進み続ける。Nori の例（25・1焚き・約1.5時間で3回復）
   *   がこの形。1周を長めに取ると再現する。
   */
  it("上限ちょうどから始めると、回している間ずっと回復が進む", () => {
    const r = run({ startLB: 25, taki: 1, cycleSec: 216 });
    expect(r.regained).toBe(3);
    expect(r.plays).toBe(28);
    expect(Math.round(r.seconds / 60)).toBe(101);
  });

  it("回復を切ると同じ条件で25回どまり", () => {
    const r = run({ startLB: 25, taki: 1, cycleSec: 216, regen: false });
    expect(r.plays).toBe(25);
    expect(r.regained).toBe(0);
  });

  it("上限を超えて回復することはない", () => {
    // 1焚きで回しても、回復は上限までしか入らない。
    const r = run({ startLB: 25, taki: 1, cycleSec: 216 });
    expect(r.leftover).toBeLessThanOrEqual(既定);
  });

  /** ★ 本題その3。オートは1日の回数で頭打ちになる。ライボが余っていても止まる。 */
  it("オートの回数上限で止まると、ライボが残ったままになる", () => {
    const r = run({ startLB: 50, taki: 1, maxPlays: PASS_LIMITS.none.autoPlays });
    expect(r.plays).toBe(10);
    expect(r.leftover).toBeGreaterThan(0);
    expect(r.stoppedBy).toBe("plays"); // 次に効く手は「焚き数を上げる」
  });

  it("PRECIOUS なら99回まで回せる", () => {
    const r = run({ startLB: 50, taki: 1, lbCap: PASS_LIMITS.precious.lbCap, maxPlays: PASS_LIMITS.precious.autoPlays });
    expect(r.plays).toBeGreaterThan(PASS_LIMITS.none.autoPlays);
    expect(r.plays).toBeLessThanOrEqual(PASS_LIMITS.precious.autoPlays);
  });

  it("カラフルパスの上限表: DELUXE はライボだけ、オート99は PRECIOUS だけ", () => {
    expect(PASS_LIMITS.none).toEqual({ lbCap: 25, autoPlays: 10 });
    expect(PASS_LIMITS.deluxe).toEqual({ lbCap: 50, autoPlays: 10 });
    expect(PASS_LIMITS.precious).toEqual({ lbCap: 50, autoPlays: 99 });
  });

  it("回復の間隔は30分に1", () => {
    expect(LB_REGEN_MIN).toBe(30);
    // ちょうど1時間ぶん回せば2回復する（上限を割った状態で回し続ける形にする）。
    const r = run({ startLB: 20, taki: 1, cycleSec: 3600 / 20 });
    expect(r.regained).toBeGreaterThanOrEqual(2);
  });

  it("0焚き・所持不足・壊れた入力では回数が出ない", () => {
    expect(run({ startLB: 25, taki: 0 }).plays).toBe(0);
    expect(run({ startLB: 3, taki: 5 }).plays).toBe(0);
    expect(run({ startLB: 3, taki: 5 }).leftover).toBe(3);
    expect(run({ startLB: 10, taki: 1, cycleSec: 0 }).plays).toBe(0);
    expect(run({ startLB: -5, taki: 1 }).plays).toBe(0);
  });
});
